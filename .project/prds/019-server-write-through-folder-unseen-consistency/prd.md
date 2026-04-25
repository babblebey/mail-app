---
title: "Server Write-Through Folder Unseen Consistency for Move and Read Mutations"
status: draft
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief"
  - type: prd
    url: .project/prds/017-optimistic-read-state-folder-badge-consistency/prd.md
    description: "Established optimistic read-state and folder badge cache contract"
  - type: prd
    url: .project/prds/018-optimistic-move-folder-badge-consistency/prd.md
    description: "Extended optimistic folder badge deltas to move actions"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Server Write-Through Folder Unseen Consistency for Move and Read Mutations

## Description

The client now applies optimistic unread badge deltas for read/unread toggles and move actions. However, after mutation settle, `listFolders` is invalidated and refetched from the database. In four mutation handlers, the database `mailFolder.unseenMessages` value is not updated at mutation time, so refetch can return stale pre-action counts and overwrite the optimistic value temporarily until background sync corrects it.

This PRD adds server-side write-through updates to `mailFolder.unseenMessages` in all read/move mutation paths that affect unread counts, so post-invalidation server data already matches the expected user-visible state.

Scope is limited to the mail router mutation handlers:

- `markAsRead`
- `batchMarkAsRead`
- `moveMessage`
- `batchMoveMessages`

No client cache strategy changes are introduced in this PRD.

### Design Decisions

- **Server truth aligns with optimism**: Keep existing optimistic client UX and make server writes immediately reflect the same unread deltas.
- **Clamp unseen to non-negative**: All decrements use `Math.max(0, ...)` to enforce non-negative unseen counts.
- **Single source folder update per mutation path**: For batch paths, compute one net delta and apply one folder update to reduce drift risk.
- **Destination folder increments are best-effort**: If destination folder row is not present in local DB cache, skip increment and rely on subsequent sync to reconcile.
- **No cross-mutation helper extraction**: Implement inline arithmetic near each mutation for readability and minimal refactor scope.
- **Preserve current invalidation behavior**: `onSettled` invalidation remains unchanged so server truth continues to reconcile cache.

### User Stories

- **As a** user marking a message read or unread, **I want** the sidebar unread badge to stay stable after the mutation settles, **so that** I do not see counts snap back.
- **As a** user moving unread messages between folders, **I want** source and destination badges to remain consistent after refetch, **so that** optimistic updates feel trustworthy.
- **As a** product engineer, **I want** unread-count write-through at mutation time, **so that** server responses reflect recent actions without waiting for periodic sync.

## Implementation Plan

### Phase 1: Single Message Read Toggle Write-Through

**Goal:** Ensure `markAsRead` updates the folder unseen count in the database whenever read-state actually changes.

#### Tasks

- [ ] In `src/server/api/routers/mail.ts`, update `markAsRead` to compute a read-toggle delta when `cached.read !== input.read`.
- [ ] After successful `mailMessage.update`, apply folder write-through:
  - `delta = input.read ? -1 : 1`
  - `unseenMessages = Math.max(0, folder.unseenMessages + delta)`
- [ ] Keep existing IMAP and message flag behavior unchanged.

### Phase 2: Batch Read Toggle Write-Through

**Goal:** Ensure `batchMarkAsRead` applies a net unseen delta in the database for all messages that actually changed read-state.

#### Tasks

- [ ] In `src/server/api/routers/mail.ts`, update `batchMarkAsRead` to accumulate `unseenDelta` across cached messages where `msg.read !== input.read`.
- [ ] Apply a single folder update after the loop when `unseenDelta !== 0`:
  - `unseenMessages = Math.max(0, folder.unseenMessages + unseenDelta)`
- [ ] Preserve existing per-message flag update logic and error handling.

### Phase 3: Single Move Write-Through (Source and Destination)

**Goal:** Ensure `moveMessage` adjusts source and destination folder unseen counts in the database when moving unread mail.

#### Tasks

- [ ] In `src/server/api/routers/mail.ts`, in `moveMessage`, read the message row before deletion to capture its `read` state.
- [ ] After successful `deleteMany`, if moved message was unread:
  - decrement source folder unseen with non-negative clamp
  - look up destination folder by `mailAccountId_path`
  - increment destination unseen by `1` if destination folder exists
- [ ] Keep destination increment best-effort and avoid throwing if destination folder is absent.

### Phase 4: Batch Move Write-Through (Source and Destination)

**Goal:** Ensure `batchMoveMessages` adjusts source and destination folder unseen counts in the database based on unread messages in the moved set.

#### Tasks

- [ ] In `src/server/api/routers/mail.ts`, in `batchMoveMessages`, read candidate messages before delete using `select: { read: true }`.
- [ ] Compute `unreadCount` from those messages.
- [ ] After successful `deleteMany`, if `unreadCount > 0`:
  - decrement source folder unseen with `Math.max(0, folder.unseenMessages - unreadCount)`
  - best-effort increment destination folder unseen by `unreadCount` when destination row exists
- [ ] Preserve current mutation response shape and existing move semantics.

### Phase 5: Validation and Regression Safety

**Goal:** Confirm no existing behavior regresses and the badge snap-back issue is resolved.

#### Tasks

- [ ] Run unit tests (`pnpm test`) and verify existing suites remain green.
- [ ] Manual verification scenarios:
  - mark unread -> read and confirm badge does not revert after settle/invalidate
  - mark read -> unread and confirm badge remains incremented after refetch
  - move single unread message and confirm source decrement and destination increment remain stable after invalidate
  - batch move mixed read/unread set and confirm only unread contribution persists post-invalidation
- [ ] Confirm no negative unseen counts are persisted under repeated read/move actions.

## Acceptance Criteria

- [ ] `markAsRead` writes through unseen count deltas to `mailFolder.unseenMessages` when read-state changes.
- [ ] `batchMarkAsRead` applies correct net unseen delta for all changed messages.
- [ ] `moveMessage` decrements source unseen and increments destination unseen for unread moves when destination folder row exists.
- [ ] `batchMoveMessages` applies source decrement and destination increment by unread-count only.
- [ ] No write-through path can persist a negative unseen count.
- [ ] Existing client optimistic cache behavior and invalidation flow remain unchanged.
- [ ] After mutation settle and `listFolders` invalidation, sidebar badges no longer snap back to stale pre-action counts.
