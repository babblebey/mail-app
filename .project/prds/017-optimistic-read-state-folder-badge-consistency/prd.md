---
title: "Optimistic Read State and Folder Badge Consistency"
status: in-progress
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief"
  - type: prd
    url: .project/prds/015-optimistic-updates/prd.md
    description: "Baseline optimistic mutation strategy for mail list/thread and account actions"
  - type: prd
    url: .project/prds/016-ui-responsiveness-performance-hardening/prd.md
    description: "Follow-up responsiveness hardening where read/unread consistency regressions were observed"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Optimistic Read State and Folder Badge Consistency

## Description

Current optimistic updates correctly toggle message read state in several paths, but three consistency gaps remain:

1. Marking messages read/unread in the mail list updates row state, but folder unread count badges do not update optimistically.
2. Marking a message unread from thread view navigates back to the list with row state eventually correct, but folder unread count badges lag.
3. Opening a message from the list and returning can leave the list row read state stale or delayed.

This PRD closes these gaps by making list rows and folder badges update immediately across list and thread interactions, while preserving server-truth reconciliation through targeted invalidation.

### Design Decisions

- **Dual-layer consistency model**: Keep optimistic cache updates for immediate UX and preserve `onSettled` invalidation to converge to server truth.
- **Folder badge optimism for read toggles**: Apply safe unread-count deltas in the `listFolders` cache for read/unread mutations, then reconcile with invalidation.
- **Instant unread navigation preserved**: Keep instant navigation when marking unread from thread view, but harden rollback and invalidation so this fast path remains correct.
- **Explicit handling of thread-open auto-read**: Ensure opening unread mail updates list-row and folder-count caches immediately rather than waiting on background sync timing.
- **No broad invalidation regressions**: Maintain targeted invalidation scope introduced by prior performance hardening.

### User Stories

- **As a** user triaging mail in the list, **I want** folder unread badges to change immediately when I mark messages read/unread, **so that** list and sidebar always feel in sync.
- **As a** user in thread view, **I want** marking a message unread and returning to list to reflect both row state and folder badge instantly, **so that** I can trust the action applied.
- **As a** user opening unread mail, **I want** the list row to reliably become read when I go back, **so that** read-state transitions feel deterministic instead of delayed.
- **As a** product engineer, **I want** rollback-safe optimistic state transitions with test coverage, **so that** future refactors do not reintroduce stale badge/state behavior.

## Implementation Plan

### Phase 1: Define and Centralize Read-State Cache Contract

**Goal:** Ensure all read/unread entry points follow one consistent optimistic + rollback + invalidate contract.

#### Tasks

- [x] Audit read/unread entry points in `src/components/mail-list.tsx`, `src/components/mail-thread.tsx`, and `src/server/api/routers/mail.ts`.
- [x] Document per-entry cache responsibilities (`listMessages`, `getMessage`, `listFolders`) and rollback requirements in implementation notes.
- [x] Add a small shared helper (or local utility section) for unread-count delta application with non-negative clamping to avoid duplicated math and drift.

#### Phase 1 Implementation Notes (2026-04-22)

- Audit findings (current behavior):
  - `src/components/mail-list.tsx` `batchMarkAsRead`: optimistic update currently touches `listMessages` only; rollback restores `listMessages`; `onSettled` invalidates both `listMessages` and `listFolders`.
  - `src/components/mail-thread.tsx` `markAsReadMutation`: `read: false` path navigates immediately and updates `listMessages` only; `read: true` path snapshots/updates `getMessage` + `listMessages`; rollback restores those caches; `onSettled` currently invalidates `getMessage` only for `read: true`.
  - `src/components/mail-thread.tsx` `moveMessageMutation`: optimistic removal from `listMessages`; rollback restores `listMessages`; `onSettled` invalidates `getMessage` + `listMessages`.
  - `src/server/api/routers/mail.ts` `markAsRead` + `batchMarkAsRead`: write-through updates message `read` and `\\Seen` flags; no direct folder unread-count write-through in these mutations.
  - `src/server/api/routers/mail.ts` `getMessage`: auto-mark-as-read updates message cache row/flags asynchronously when a message is opened.
- Cache contract established for all read-state entry points:
  - `listMessages`: primary optimistic source for list row read/unread transitions.
  - `getMessage`: optimistic source for thread pane state when viewing a specific message.
  - `listFolders`: optimistic source for unread badge deltas with server-truth reconciliation via targeted invalidation.
  - Rollback requirement: every optimistic cache touched in `onMutate` must be snapshot and restored in `onError`.
  - Reconciliation requirement: keep targeted `onSettled` invalidation for all touched read-state surfaces to converge to server truth.
- Shared helper added in `src/lib/mail-utils.ts`:
  - `getUnreadDeltaForReadToggle(currentRead, nextRead)` for canonical transition delta math.
  - `applyUnreadDeltaWithClamp(currentUnread, delta)` for non-negative unread count clamping while preserving `undefined` counts.

### Phase 2: Mail List Read/Unread Folder Badge Optimism

**Goal:** Make folder unread badges update immediately when list batch read/unread actions run.

#### Tasks

- [x] In `src/components/mail-list.tsx`, extend `batchMarkAsRead.onMutate` to snapshot `listFolders` cache in addition to `listMessages`.
- [x] Apply optimistic unread-count delta updates to the active folder badge based on only messages that actually change read state.
- [x] In `onError`, restore both `listMessages` and `listFolders` snapshots.
- [x] Keep `onSettled` invalidation for `listMessages` and `listFolders` to reconcile counts with server truth.

#### Phase 2 Implementation Notes (2026-04-22)

- `src/components/mail-list.tsx` `batchMarkAsRead.onMutate` now cancels and snapshots both `listMessages` and `listFolders`.
- Optimistic unread badge delta is computed from currently cached list rows and includes only messages where read-state actually transitions (`currentRead !== nextRead`).
- Active folder badge (`listFolders` entry matching current `folder`) is updated optimistically using shared helpers:
  - `getUnreadDeltaForReadToggle`
  - `applyUnreadDeltaWithClamp`
- `onError` restores both snapshots (`previousMessages`, `previousFolders`).
- `onSettled` continues targeted reconciliation invalidation for both `listMessages` and `listFolders`.

### Phase 3: Thread Read/Unread Consistency and Navigation Safety

**Goal:** Fix single-message thread actions so list row and folder badge stay aligned during fast navigation.

#### Tasks

- [x] In `src/components/mail-thread.tsx`, extend `markAsReadMutation.onMutate` to snapshot and optimistically update `listFolders` alongside existing caches.
- [x] Preserve instant navigation on mark-unread, but guarantee optimistic write ordering and rollback coverage for that path.
- [x] Update `markAsReadMutation.onSettled` to always invalidate `getMessage`, `listMessages`, and `listFolders` for both `read: true` and `read: false`.
- [x] Extend `moveMessageMutation.onSettled` to include `listFolders` invalidation so folder badges reconcile after move/delete/spam actions from thread.

### Phase 4: Thread-Open Auto-Read Back-Nav Reliability

**Goal:** Ensure opening unread mail and going back immediately produces stable list-row read state and folder badge delta.

#### Tasks

- [x] In `src/components/mail-thread.tsx`, add a cache-sync path tied to successful thread-open/read state so backing to list shows updated read state without delay.
- [x] Validate server-side auto-read behavior in `src/server/api/routers/mail.ts` for timing/consistency with client cache updates.
- [x] Ensure any fallback invalidation remains folder-scoped/targeted and does not reintroduce broad rerender churn.

### Phase 5: Regression Coverage and Verification

**Goal:** Prevent reintroduction of stale read-state or badge inconsistencies.

#### Tasks

- [ ] Add or extend unit tests in `tests/unit/mail-interactions.test.ts` for optimistic unread-count delta math, rollback restoration, and non-negative count guarantees.
- [ ] Add tests for thread mark-unread instant-navigation behavior and open-thread-then-back read-state consistency.
- [x] Add or extend unit tests in `tests/unit/mail-interactions.test.ts` for optimistic unread-count delta math, rollback restoration, and non-negative count guarantees.
- [x] Add tests for thread mark-unread instant-navigation behavior and open-thread-then-back read-state consistency.
- [ ] Run targeted test suite and perform manual verification scenarios:
  - list batch mark read/unread updates row + badge immediately
  - thread mark unread returns to list with row + badge correct immediately
  - open unread thread then back updates row + badge without lag

#### Phase 5 Implementation Notes (2026-04-22)

- Extended `tests/unit/mail-interactions.test.ts` with coverage for:
  - `getUnreadDeltaForReadToggle` transition math contract.
  - `applyUnreadDeltaWithClamp` non-negative clamping and `undefined` preservation.
  - Thread mark-unread fast-path contract (instant navigation ordering + optimistic list/folder updates).
  - Thread read/unread rollback restoration across `getMessage`, `listMessages`, and `listFolders` snapshots.
  - Thread-open auto-read cache sync contract for back-nav consistency, including scoped invalidation when row is absent.
- Targeted suite executed successfully:
  - Command: `pnpm vitest run tests/unit/mail-interactions.test.ts`
  - Result: 1 file passed, 51 tests passed.

## Acceptance Criteria

- [x] Folder unread badge in sidebar updates optimistically when list batch mark read/unread is triggered.
- [x] Folder unread badge updates optimistically when thread-level mark read/unread is triggered.
- [x] Marking unread from thread view keeps instant navigation behavior and remains rollback-safe on failure.
- [x] Opening unread mail then navigating back updates list row read state without delayed or missing transition.
- [x] `markAsReadMutation` invalidates `getMessage`, `listMessages`, and `listFolders` in `onSettled` for both read/unread branches.
- [x] `moveMessageMutation` invalidates `listFolders` in `onSettled` from thread view actions.
- [x] No negative unread badge counts occur under optimistic delta updates.
- [x] New/updated tests covering optimistic read/badge consistency pass in `tests/unit/mail-interactions.test.ts`.
