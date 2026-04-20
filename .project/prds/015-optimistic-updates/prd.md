---
title: "Optimistic Updates for Mail & Account Mutations"
status: draft
references:
  - type: prd
    url: .project/prds/011-mail-list-group-actions/prd.md
    description: "Prior PRD — Batch mark-as-read and batch move mutations in mail list"
  - type: prd
    url: .project/prds/012-thread-view-toolbar-actions/prd.md
    description: "Prior PRD — Thread view toolbar actions (mark as read/unread, delete, move, report spam)"
  - type: prd
    url: .project/prds/013-mail-list-context-menu/prd.md
    description: "Prior PRD — Mail list context menu (right-click delete, mark as read/unread, move to)"
  - type: prd
    url: .project/prds/010-thread-view-message-actions-dropdown/prd.md
    description: "Prior PRD — Thread view message actions dropdown (moveMessage, markAsRead mutations)"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Optimistic Updates for Mail & Account Mutations

## Description

All mutations across the application currently use a **server-first** pattern: the user triggers an action, the UI waits for the server to respond, then invalidates the relevant queries to refetch fresh data. This causes a noticeable delay between clicking an action (e.g. "Mark as read", "Delete") and seeing the result reflected in the UI. For frequent read-state and move actions, this lag feels sluggish.

This PRD adds **optimistic updates** to all mutations where the expected outcome is predictable before the server responds. Each mutation will immediately update the tRPC query cache via `onMutate`, define rollback logic in `onError` to restore the previous cache state if the server call fails, and still invalidate queries in `onSettled` to ensure long-term consistency with the server.

### Design Decisions

- **Optimistic cache manipulation via `utils.*.setData()` and `utils.*.setInfiniteData()`**: tRPC's `useUtils()` exposes typed setters for query caches. For standard queries (`getMessage`, `mailAccount.list`) we use `setData()`. For infinite queries (`listMessages`) we use `setInfiniteData()` to map over all loaded pages.
- **Rollback on error via `onError` context**: Each `onMutate` callback snapshots the current cache state and returns it as context. The `onError` callback restores this snapshot, giving the user immediate visual feedback that the action failed.
- **`onSettled` replaces `onSuccess` for invalidation**: All current `onSuccess` callbacks that call `invalidate()` are moved to `onSettled` so that the cache is re-synced with the server regardless of success or failure. This ensures the optimistic state is eventually replaced by the true server state.
- **Selection clearing remains instant**: For batch actions in the mail list, `setSelected(new Set())` is moved from `onSuccess` to `onMutate` so the selection is cleared immediately alongside the optimistic cache update.
- **Navigation on move/delete stays in `onSuccess`**: In the thread view, `router.push(backHref)` for move/delete actions remains in `onSuccess` rather than `onMutate`, because navigating away before the server confirms could leave the user stranded if the action fails. However, the list cache is still optimistically updated so the message is already gone from the list when the user lands back.
- **Folder unread counts are invalidated, not optimistically computed**: Calculating exact unread count deltas from the client is error-prone (the message may already have been read/moved by another client). Instead, `listFolders` is invalidated in `onSettled` to fetch accurate counts from the server. This is an acceptable trade-off since folder counts are secondary UI.
- **`triggerSync`, `create`, `update`, `testConnection` mutations are excluded**: These are server-side operations where the outcome cannot be predicted from the client. They already show appropriate loading states (spinners, pending flags) and do not benefit from optimistic updates.

### User Stories

- **As a** user reading my inbox, **I want** messages I mark as read to instantly lose their unread indicator, **so that** the UI feels responsive and I can quickly triage multiple messages.
- **As a** user deleting messages from my inbox, **I want** the deleted messages to vanish from the list immediately, **so that** I don't have to wait for the server to confirm before continuing.
- **As a** user moving messages to a folder, **I want** the messages to disappear from the current view instantly, **so that** the UI reflects my intent without delay.
- **As a** user marking a message as unread from the thread view, **I want** the read state to toggle immediately, **so that** I see instant feedback before navigating back to the list.
- **As a** user managing mail accounts in settings, **I want** the default badge to swap instantly when I set a new default, **so that** the UI feels snappy.
- **As a** user deleting a mail account, **I want** the account card to disappear immediately after confirming, **so that** I don't see a stale card while the server processes the deletion.

## Implementation Plan

### Phase 1: Mail List — Batch Mark as Read/Unread

**Goal:** Add optimistic updates to the `batchMarkAsRead` mutation in `src/components/mail-list.tsx` so that toggling read state on selected messages is reflected instantly in the mail list.

#### Tasks

- [x] In `src/components/mail-list.tsx`, refactor the `batchMarkAsRead` mutation to add an `onMutate` callback that:
  1. Cancels any in-flight `listMessages` queries via `await utils.mail.listMessages.cancel()`
  2. Snapshots the current `listMessages` infinite query data via `utils.mail.listMessages.getInfiniteData({ folder, limit: 50 })`
  3. Calls `utils.mail.listMessages.setInfiniteData({ folder, limit: 50 }, (oldData) => ...)` to map over all pages and set `read` to the mutation's `read` value for every message whose `uid` is in the `uids` array
  4. Clears the selection via `setSelected(new Set())`
  5. Returns `{ previousMessages }` as context for rollback
- [x] Add an `onError` callback to the `batchMarkAsRead` mutation that restores the snapshot: call `utils.mail.listMessages.setInfiniteData({ folder, limit: 50 }, context.previousMessages)` and restore the selection if needed
- [x] Replace the existing `onSuccess` callback with an `onSettled` callback that invalidates `mail.listMessages` and `mail.listFolders` to re-sync with the server

### Phase 2: Mail List — Batch Move Messages

**Goal:** Add optimistic updates to the `batchMoveMessages` mutation in `src/components/mail-list.tsx` so that deleted, spam-reported, or moved messages vanish from the list instantly.

#### Tasks

- [x] In `src/components/mail-list.tsx`, refactor the `batchMoveMessages` mutation to add an `onMutate` callback that:
  1. Cancels any in-flight `listMessages` queries via `await utils.mail.listMessages.cancel()`
  2. Snapshots the current `listMessages` infinite query data via `utils.mail.listMessages.getInfiniteData({ folder, limit: 50 })`
  3. Calls `utils.mail.listMessages.setInfiniteData({ folder, limit: 50 }, (oldData) => ...)` to filter out all messages whose `uid` is in the `uids` array from every page
  4. Clears the selection via `setSelected(new Set())`
  5. Returns `{ previousMessages }` as context for rollback
- [x] Add an `onError` callback to the `batchMoveMessages` mutation that restores the snapshot via `utils.mail.listMessages.setInfiniteData({ folder, limit: 50 }, context.previousMessages)`
- [x] Replace the existing `onSuccess` callback with an `onSettled` callback that invalidates `mail.listMessages` and `mail.listFolders`

### Phase 3: Thread View — Mark as Read/Unread

**Goal:** Add optimistic updates to the `markAsReadMutation` in `src/components/mail-thread.tsx` so that toggling the read state on a single message is reflected instantly in both the thread view and the mail list behind it.

#### Tasks

- [ ] In `src/components/mail-thread.tsx`, refactor the `markAsReadMutation` to add an `onMutate` callback that:
  1. Cancels in-flight `getMessage` and `listMessages` queries via `await utils.mail.getMessage.cancel({ folder, uid })` and `await utils.mail.listMessages.cancel()`
  2. Snapshots the current `getMessage` data via `utils.mail.getMessage.getData({ folder, uid })` and the current `listMessages` infinite data
  3. Calls `utils.mail.getMessage.setData({ folder, uid }, (old) => old ? { ...old, read: variables.read } : old)` to instantly flip the read flag in the thread view
  4. Calls `utils.mail.listMessages.setInfiniteData(...)` to update the matching message's `read` flag across all loaded pages
  5. Returns `{ previousMessage, previousMessages }` as context for rollback
- [ ] Add an `onError` callback that restores both snapshots
- [ ] Move the `router.push(backHref)` for the "mark as unread" case to remain in `onSuccess` (user should only navigate after server confirms)
- [ ] Replace the remaining `onSuccess` invalidation logic with an `onSettled` callback that invalidates `mail.getMessage` and `mail.listMessages`

### Phase 4: Thread View — Move Message

**Goal:** Add optimistic updates to the `moveMessageMutation` in `src/components/mail-thread.tsx` so that the message is removed from the mail list cache instantly when the user deletes, reports spam, or moves to a folder.

#### Tasks

- [ ] In `src/components/mail-thread.tsx`, refactor the `moveMessageMutation` to add an `onMutate` callback that:
  1. Cancels in-flight `listMessages` queries via `await utils.mail.listMessages.cancel()`
  2. Snapshots the current `listMessages` infinite data
  3. Calls `utils.mail.listMessages.setInfiniteData(...)` to filter out the message with the matching `uid` from all loaded pages — so when the user navigates back, the message is already gone from the list
  4. Returns `{ previousMessages }` as context for rollback
- [ ] Add an `onError` callback that restores the `listMessages` snapshot
- [ ] Keep `router.push(backHref)` in `onSuccess` so navigation only happens after server confirmation
- [ ] Replace the remaining `onSuccess` invalidation logic with an `onSettled` callback that invalidates `mail.getMessage` and `mail.listMessages`

### Phase 5: Settings — Set Default Account

**Goal:** Add optimistic updates to the `setDefaultMutation` in `src/app/dashboard/settings/page.tsx` so that the "Default" badge swaps instantly when the user clicks the star icon.

#### Tasks

- [ ] In `src/app/dashboard/settings/page.tsx`, refactor the `setDefaultMutation` to add an `onMutate` callback that:
  1. Cancels in-flight `mailAccount.list` queries via `await utils.mailAccount.list.cancel()`
  2. Snapshots the current `mailAccount.list` data via `utils.mailAccount.list.getData()`
  3. Calls `utils.mailAccount.list.setData(undefined, (old) => old?.map((a) => ({ ...a, isDefault: a.id === variables.id })))` to set `isDefault: true` on the target account and `isDefault: false` on all others
  4. Returns `{ previousAccounts }` as context for rollback
- [ ] Add an `onError` callback that restores the snapshot via `utils.mailAccount.list.setData(undefined, context.previousAccounts)`
- [ ] Replace the existing `onSuccess` callback with an `onSettled` callback that invalidates `mailAccount.list`

### Phase 6: Settings — Delete Account

**Goal:** Add optimistic updates to the `deleteMutation` in `src/app/dashboard/settings/page.tsx` so that the account card disappears immediately after the user confirms deletion.

#### Tasks

- [ ] In `src/app/dashboard/settings/page.tsx`, refactor the `deleteMutation` to add an `onMutate` callback that:
  1. Cancels in-flight `mailAccount.list` queries via `await utils.mailAccount.list.cancel()`
  2. Snapshots the current `mailAccount.list` data via `utils.mailAccount.list.getData()`
  3. Calls `utils.mailAccount.list.setData(undefined, (old) => old?.filter((a) => a.id !== variables.id))` to remove the deleted account from the cache
  4. Returns `{ previousAccounts }` as context for rollback
- [ ] Add an `onError` callback that restores the snapshot via `utils.mailAccount.list.setData(undefined, context.previousAccounts)`
- [ ] Replace the existing `onSuccess` callback with an `onSettled` callback that invalidates `mailAccount.list`

## Acceptance Criteria

- [ ] Marking messages as read/unread in the mail list toolbar or context menu instantly toggles the unread dot on affected messages without waiting for a server response
- [ ] Deleting, reporting spam, or moving messages from the mail list instantly removes them from the visible list
- [ ] Marking a message as read/unread in the thread view instantly updates the read state shown in the thread
- [ ] Moving/deleting a message from the thread view removes it from the mail list cache so it is already gone when the user navigates back
- [ ] Setting a default account in settings instantly swaps the "Default" badge to the selected account
- [ ] Deleting an account in settings instantly removes the account card after confirmation
- [ ] If any mutation fails, the UI rolls back to the previous state — the optimistic change is reverted and the user sees the original data
- [ ] After every mutation (success or failure), queries are invalidated via `onSettled` to ensure eventual consistency with the server
- [ ] No regressions in existing functionality — all actions still perform the same server-side operations as before
