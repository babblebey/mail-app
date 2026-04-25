---
title: "Optimistic Move-Action Folder Badge Consistency"
status: in-progress
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief"
  - type: prd
    url: .project/prds/015-optimistic-updates/prd.md
    description: "Baseline optimistic mutation strategy — move and read mutations introduced"
  - type: prd
    url: .project/prds/017-optimistic-read-state-folder-badge-consistency/prd.md
    description: "Read-toggle folder badge consistency — established shared delta helpers and dual-layer cache contract"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Optimistic Move-Action Folder Badge Consistency

## Description

Move actions (delete, report spam, move to folder) currently remove message rows from the list optimistically but do not apply any unread-count delta to folder badges until the server mutation settles and `listFolders` is invalidated. This means when a user moves unread messages, the sidebar folder badge lags behind the row removal — the list already looks correct but the badge still shows the pre-move count.

This PRD closes the gap by extending the optimistic cache contract to move mutations in both thread view (single-message) and mail list (batch), applying immediate unread-count deltas to both the source and destination folder badges, and rolling back those deltas on failure.

This work is explicitly scoped to **move-action badge optimism only** and does not revisit the read-toggle paths covered in PRD 017.

### Design Decisions

- **Source folder decrement**: When an unread message is moved away from a folder, its contribution to that folder's `unseenMessages` is removed immediately in the cache.
- **Destination folder increment**: When an unread message arrives in a destination folder, that folder's `unseenMessages` is incremented optimistically.
- **Unknown destination unseenMessages**: If the destination folder's `unseenMessages` is `undefined` (not yet loaded), skip the destination increment and allow `onSettled` invalidation to provide the correct value. This prevents speculative drift.
- **Reuse of shared helpers**: Use the existing `applyUnreadDeltaWithClamp` helper from `src/lib/mail-utils.ts` for clamped application. Add a complementary `countUnreadInMessages` helper for deriving the unread contribution of a set of moved messages from cached rows.
- **Cache-only delta, no server write-through**: No server-side changes are needed. Server unread counts converge via the existing targeted `onSettled` invalidation of `listFolders`.
- **Rollback parity**: Every cache touched in `onMutate` (both `listMessages` and `listFolders`) must be snapshot and fully restored in `onError`.

### User Stories

- **As a** user deleting unread mail from thread view, **I want** the folder unread badge to drop immediately when I hit delete, **so that** the sidebar accurately reflects the action without a visible lag.
- **As a** user reporting spam on unread mail, **I want** the current folder badge to decrement and the Junk badge to increment instantly, **so that** both folder counts update together in one action.
- **As a** user moving unread messages in bulk from the mail list, **I want** source and destination folder badges to update optimistically, **so that** the sidebar stays in sync with the list as I triage.
- **As a** product engineer, **I want** move-action badge updates to be rollback-safe with test coverage, **so that** network failures never leave badges in an incorrect state.

## Implementation Plan

### Phase 1: Shared Move-Delta Helper

**Goal:** Provide a reusable, tested helper for computing the unread count contribution of a set of messages, so delta math is not duplicated across thread and list mutations.

#### Tasks

- [x] In `src/lib/mail-utils.ts`, add `countUnreadInMessages(messages: { read: boolean }[]): number` that counts messages where `read === false`.
- [x] Document the function's role in optimistic move-delta computation alongside the existing helpers.

### Phase 2: Thread Single-Message Move Optimistic Badges

**Goal:** Make `moveMessageMutation` in thread view immediately update source and destination folder unread badges when the moved message is unread.

#### Tasks

- [x] In `src/components/mail-thread.tsx`, update `moveMessageMutation.onMutate` to:
  - Cancel and snapshot `listFolders` alongside the existing `listMessages` cancel/snapshot.
  - Resolve the moved message's current read state from `getMessage` cache or `listMessages` cache.
  - If the message is unread, apply `-1` to the source folder (`folder`) `unseenMessages` via `applyUnreadDeltaWithClamp`.
  - If the message is unread and the destination folder has a defined `unseenMessages`, apply `+1` to the destination folder's entry via `applyUnreadDeltaWithClamp`.
  - Return `{ previousMessages, previousFolders }` context.
- [x] In `moveMessageMutation.onError`, restore the `previousFolders` snapshot alongside the existing `previousMessages` restoration.
- [x] Confirm `moveMessageMutation.onSettled` already invalidates `listFolders` (it does — no change needed, only verify).

### Phase 3: List Batch-Move Optimistic Badges

**Goal:** Make `batchMoveMessages` in mail list immediately update source and destination folder unread badges based on the read states of all selected messages.

#### Tasks

- [x] In `src/components/mail-list.tsx`, update `batchMoveMessages.onMutate` to:
  - Cancel and snapshot `listFolders` alongside the existing `listMessages` cancel/snapshot.
  - Collect the set of messages being moved by filtering all pages of the `listMessages` infinite cache by `variables.uids`.
  - Count unread messages in that set using the new `countUnreadInMessages` helper.
  - If `unreadCount > 0`, apply `-unreadCount` to the source folder (`folder`) `unseenMessages` via `applyUnreadDeltaWithClamp`.
  - If `unreadCount > 0` and the destination folder has a defined `unseenMessages`, apply `+unreadCount` to the destination folder's `unseenMessages`.
  - Return `{ previousMessages, previousFolders }` context.
- [x] In `batchMoveMessages.onError`, restore the `previousFolders` snapshot alongside the existing `previousMessages` restoration.
- [x] Confirm `batchMoveMessages.onSettled` already invalidates `listFolders` (it does — no change needed, only verify).

### Phase 4: Regression Coverage and Verification

**Goal:** Prevent reintroduction of stale move-action badge behavior and guarantee rollback safety.

#### Tasks

- [ ] In `tests/unit/mail-interactions.test.ts`, add or extend tests for:
  - `countUnreadInMessages` — returns correct count for all-read, all-unread, and mixed inputs.
  - Thread single-move optimistic: moving an unread message decrements source badge.
  - Thread single-move optimistic: moving a read message leaves source badge unchanged.
  - Thread single-move optimistic: moving an unread message to a folder with defined `unseenMessages` increments destination badge.
  - Thread single-move optimistic: moving an unread message to a folder with `undefined` `unseenMessages` leaves destination badge undefined.
  - Thread single-move rollback: `onError` restores both `listMessages` and `listFolders` to pre-mutation snapshots.
  - Batch move optimistic: moving 3 unread + 2 read messages decrements source badge by 3.
  - Batch move optimistic: moving 0 unread messages leaves source badge unchanged.
  - Batch move optimistic: destination badge increments by the correct unread count.
  - Batch move rollback: `onError` restores both `listMessages` and `listFolders`.
  - Non-negative clamp: source badge does not go below 0 under any delta input.
- [ ] Run the unit test suite (`pnpm test`) and confirm all new and existing mail-interaction tests pass.
- [ ] Perform manual verification:
  - Delete an unread message from thread view → source folder badge decrements immediately, Trash badge increments immediately.
  - Report spam on an unread message from thread view → source badge decrements, Junk badge increments immediately.
  - Move unread message to a folder from thread view → source and destination badges update immediately.
  - Select a mix of read/unread messages in list and batch-delete → source badge decrements by only the unread count.
  - Force a network error on move → list rows and folder badges revert to pre-move state.

## Acceptance Criteria

- [ ] Moving an unread message from thread view decrements the source folder unread badge immediately (before server response).
- [ ] Moving an unread message from thread view to a destination with a known unread count increments the destination folder badge immediately.
- [ ] Batch-moving messages from the mail list applies the correct unread-count delta to source and destination folder badges immediately.
- [ ] Moving read-only messages produces no folder badge delta in either direction.
- [ ] On mutation failure, both `listMessages` and `listFolders` are fully restored to their pre-mutation snapshots.
- [ ] `unseenMessages` never goes below `0` under any optimistic delta path.
- [ ] Destination folder badge is left unchanged if `unseenMessages` is `undefined` in the cache.
- [ ] `countUnreadInMessages` helper is covered by unit tests with all-read, all-unread, and mixed inputs.
- [ ] All new and existing unit tests in `tests/unit/mail-interactions.test.ts` pass.
