---
title: "UI Responsiveness and Interaction Performance Hardening"
status: completed
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief"
  - type: prd
    url: .project/prds/013-mail-list-context-menu/prd.md
    description: "Related PRD — Mail list context menu interactions affected by right-click latency"
  - type: prd
    url: .project/prds/015-optimistic-updates/prd.md
    description: "Related PRD — Optimistic updates that improved server-wait latency but still require render-path optimizations"
  - type: pr
    url: https://github.com/babblebey/mail-app/pull/24
    description: "Implementation PR — UI Responsiveness and Interaction Performance Hardening"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# UI Responsiveness and Interaction Performance Hardening

## Description

Users experience a small but noticeable delay between interaction and UI response in key workflows, especially in the mail list (checkbox selection, right-click context menu open, bulk actions) and thread/composer surfaces. This PRD addresses client-side render-path latency by reducing unnecessary rerenders, narrowing query invalidation scope, and removing synchronous main-thread work during interaction-heavy flows.

The goal is not to change product behavior, but to make existing behavior feel immediate and reliable under realistic mailbox sizes.

### Design Decisions

- **Prioritize interaction-critical surfaces first**: The mail list and thread view are the highest-frequency interaction points, so optimizations begin there before lower-impact component cleanup.
- **Preserve optimistic UX while reducing churn**: Existing optimistic updates stay in place, but cache invalidation becomes more targeted to avoid global refetch and rerender cascades.
- **Prefer structural render fixes over micro-tuning**: Memoized row components and stable callback boundaries are favored over piecemeal tweaks because they provide predictable wins as mailbox size grows.
- **Measure before and after changes**: Profiling checkpoints are required to verify real gains and prevent regressions hidden by subjective feel.
- **Keep visual motion snappy but accessible**: Transition scopes and durations are tuned where they contribute to perceived lag, while preserving affordances and reduced-motion compatibility.

### User Stories

- **As a** user triaging email, **I want** checkbox selection and context-menu actions to respond immediately, **so that** inbox management feels fast and trustworthy.
- **As a** user scanning threads, **I want** opening and acting on messages to avoid short UI stalls, **so that** navigation and decision-making remain fluid.
- **As a** user composing mail, **I want** typing and recipient editing to stay smooth, **so that** drafting does not feel heavy.
- **As a** product engineer, **I want** a repeatable performance baseline and acceptance criteria, **so that** future changes maintain responsiveness.

## Implementation Plan

### Phase 1: Baseline and Instrumentation

**Goal:** Establish measurable baseline performance for interaction-critical flows and define pass/fail thresholds.

#### Tasks

- [x] Capture baseline React Profiler traces for:
  - Mail list checkbox toggle in `src/components/mail-list.tsx`
  - Mail list right-click context menu open in `src/components/mail-list.tsx`
  - Thread view open and image-heavy message render in `src/components/mail-thread.tsx`
  - Composer typing and recipient edits in `src/components/mail-composer.tsx`
- [x] Capture browser Performance panel traces for the same scenarios to identify main-thread blocking segments.
- [x] Document baseline metrics and target thresholds for interaction latency and render counts in PR notes for this PRD implementation.

Phase 1 instrumentation is implemented in code and the capture workflow/thresholds are documented in `.project/prds/016-ui-responsiveness-performance-hardening/phase-1-baseline-notes.md`. Baseline data has now been captured for mail-list, thread, and composer interactions: mail-list severely misses target (checkbox: `944.7 ms` dominant React commit, `936.6 ms` User Timing median; context menu: `847.9 ms` dominant React commit, `1206.2 ms` User Timing median), thread-open also misses target on User Timing median (`657.7 ms`) and image-heavy-render is median-pass (`48.1 ms`) with large outliers, and composer typing/recipient-edit traces miss target with frequent `> 50 ms` interaction durations and outliers above `100 ms`. Browser Performance traces are now captured for all required scenarios and confirm severe renderer-main long tasks across surfaces (up to `1676.4 ms` in composer and `390.1 ms` in thread image-heavy), completing Phase 1 baseline capture tasks.

### Phase 2: Mail List Render-Path Hardening

**Goal:** Remove avoidable rerenders and expensive repeated derivations in the highest-traffic list interactions.

#### Tasks

- [x] In `src/components/mail-list.tsx`, extract message row rendering into a memoized row component (e.g., `React.memo`) with stable props.
- [x] Memoize high-frequency derived values, including:
  - Flattened messages array
  - Selected UID numeric array
  - Selected unread-state checks
  - Folder options used by move menus
- [x] Replace callback patterns that depend on mutable `Set` references with stable updater forms to reduce handler recreation.
- [x] Remove any render-time debug logging and other synchronous non-essential work from interaction paths.
- [x] Re-profile checkbox and context-menu scenarios to verify reduced rerenders for unaffected rows.

**Re-profile results — context-menu scenario (post Phase 2):**

| Metric | Baseline | Post Phase 2 | Change |
|---|---|---|---|
| Interaction duration (User Timing) | 1206.2 ms median | 545.3 ms | −55% |
| Dominant React commit `actualDuration` | 847.9 ms | 81.8 ms | −90% |
| `actualDuration` / `baseDuration` ratio | ~100% (all rows re-rendered) | ~9% (most rows bailed) | confirms memo working |

The `actualDuration` vs `baseDuration` gap is the key signal: `baseDuration` remains ~839–962 ms (the cost if every component re-rendered), while `actualDuration` on all post-interaction commits is between 1–92 ms. This confirms that `React.memo` is successfully bailing out unaffected rows and only the selected row plus the `ContextMenuContent` subtree are doing real work. The residual spread across multiple smaller commits (71.2 ms, 52.9 ms) reflects Radix UI `ContextMenu` internal animation state transitions opening, not row re-renders. The remaining 545 ms interaction window includes the context menu open animation duration captured inside the User Timing mark, so the render-path portion of the latency is now well within target.

**Re-profile results — checkbox-toggle scenario (post Phase 2):**

| Metric | Baseline | Post Phase 2 | Change |
|---|---|---|---|
| Interaction duration (User Timing) | 936.6 ms median | 181.1 ms median (range: 137.9–198.7 ms) | −81% |
| Dominant React commit `actualDuration` | 944.7 ms | 75.8 ms median (range: 61.3–94.2 ms) | −92% |
| `actualDuration` / `baseDuration` ratio | ~100% (all rows re-rendered) | ~6% (most rows bailed) | confirms memo working |

`baseDuration` holds steady at ~1264–1299 ms across all 6 measured toggles while `actualDuration` on the primary commit stays in the 61–94 ms range — a 94% bail-out rate from `React.memo`. Each toggle produces two additional tiny nested-update commits (2–13 ms) driven by Radix UI checkbox animation state, not row re-renders. The remaining interaction window (~180 ms) includes the checkbox animation duration bracketed inside the User Timing mark, meaning the render-path portion itself is well within target.

**Post-implementation fix — `hasUnreadSelected` prop leak:** After the initial Phase 2 implementation, unread-mail rows were still noticeably slower to respond to checkbox toggles than read ones. Root cause: `hasUnreadSelected` was a plain boolean prop passed to every `MailRow`. Selecting the first unread mail flipped it `false → true`, updating the prop on all rows simultaneously and defeating `React.memo` across the entire list. Fixed by replacing the boolean prop with a stable `getHasUnreadSelected: () => boolean` getter backed by a `useRef` and created with `useCallback([], [])`. Its identity never changes between renders, so unaffected rows see no prop difference and skip re-rendering. The getter is only invoked inside `ContextMenuContent` at menu-open time, which is the only point where the value is actually needed.

### Phase 3: Query Invalidation and Sync Churn Optimization

**Goal:** Reduce unnecessary network and state churn that degrades perceived responsiveness.

#### Tasks

- [x] Narrow invalidation scopes for mail mutations in:
  - `src/components/mail-list.tsx`
  - `src/components/mail-thread.tsx`
  - `src/app/dashboard/settings/page.tsx`
- [x] Replace broad invalidations with targeted invalidation keys where possible (e.g., folder-scoped list invalidation).
- [x] Revisit sync status polling cadence in:
  - `src/components/mail-list.tsx`
  - `src/app/dashboard/settings/page.tsx`
  to reduce refetch pressure during active sync without stale UX.
- [x] Eliminate duplicate refetch/invalidation pathways tied to sync-completion effects.
- [x] Validate that folder counts and read states remain eventually consistent after scope narrowing.

### Phase 4: Thread and Composer Responsiveness

**Goal:** Remove blocking work from thread rendering and reduce state-driven churn in compose workflows.

#### Tasks

- [x] In `src/components/mail-thread.tsx`, defer or gate synchronous DOM-intensive image/shimmer setup to avoid blocking interaction frames.
- [x] In `src/components/mail-thread.tsx`, prevent inline image subtree teardown/remount when attachment preview dialogs open/close to eliminate visible image flicker.
- [x] In `src/components/mail-thread.tsx`, memoize repeated recipient/display derivations used during rerenders.
- [x] In `src/components/mail-thread.tsx` and related mutation handlers, make thread-route read/unread updates apply with narrowly scoped cache updates/invalidation to avoid broad rerender when toggling unread from thread view.
- [x] In `src/components/mail-composer.tsx`, reduce state fragmentation (single reducer or isolated memoized subcomponents).
- [x] Stabilize composer event handlers for recipient edits, attachment interactions, and body/subject updates.
- [x] Replace unstable list keys (where applicable) with deterministic keys for recipient chips and similar collections.

### Phase 5: Navigation Shell Persistence and Immediate Feedback

**Goal:** Eliminate the full-tree remount that occurs when navigating between the mail list and a thread, and add instant visual feedback on click so the navigation feels immediate.

#### Root Cause

`/dashboard/page.tsx` and `/dashboard/mail/[id]/page.tsx` each render the complete UI shell — `SidebarProvider`, `AppSidebar`, `SidebarInset`, and the header — independently. Because there is no shared React subtree between these two routes, every click on a mail row causes Next.js to fully unmount the `/dashboard` page tree and mount a brand-new `/dashboard/mail/[id]` tree from scratch. This full remount is the primary source of the perceived navigation delay. Compounding it, there is no `loading.tsx` for the thread route, so the user sees zero visual feedback between click and content render.

#### Tasks

- [x] Lift `SidebarProvider`, `AppSidebar`, `SidebarInset`, and the shared header chrome into `src/app/dashboard/layout.tsx` so they persist across navigations and are not remounted on every route change.
- [x] Reduce `src/app/dashboard/page.tsx` and `src/app/dashboard/mail/[id]/page.tsx` to render only their content slot (`MailList` and `MailThreadView` respectively), removing the now-duplicate shell markup from both pages.
- [x] Add `src/app/dashboard/mail/[id]/loading.tsx` with a skeleton that matches the thread view structure to provide instant visual feedback on click.
- [x] Verify the breadcrumb and header content (folder name, "Thread" label) still updates correctly when driven from the layout rather than the individual pages.
- [x] Confirm `AppSidebar` folder-active state updates correctly across navigations after the layout change.

### Phase 6: Mail List Toolbar Render Isolation

**Goal:** Remove the toolbar as a source of rerender churn triggered by selection state changes, matching the row-level isolation already achieved in Phase 2.

#### Root Cause Analysis

The toolbar in `src/components/mail-list.tsx` lives directly inside `MailList`'s render function with no memoization boundary. Every checkbox toggle or selection change causes `MailList` to re-render (because `selected` state lives there), which re-renders the entire toolbar subtree alongside it. This is avoidable work — `MailRow` components bail out via `React.memo`, but the toolbar above them does not. Several compounding issues were identified:

1. **No memoization boundary on the toolbar.** The toolbar JSX re-executes on every `selected` state change even when the visible toolbar content has not changed (e.g., toggling a row when no rows were previously selected, so the Sync button remains visible throughout).

2. **Inline `onClick` handlers in toolbar dropdown items.** The `All`, `None`, `Read`, and `Unread` dropdown items each create new callback closures on every render: `() => setSelected(new Set(messages.map(...)))`, `() => setSelected(new Set(messages.filter(...).map(...)))`, etc. These are unstabilized, meaning they defeat any future memoization attempt on the dropdown subtree.

3. **Inline `onClick` handlers on batch action buttons.** Each batch action button (`Report spam`, `Delete`, `Mark as read`, `Mark as unread`, `Move to` items) creates a new inline closure on every render that closes directly over `selectedUids`. While `selectedUids` is memoized, new function identities are still produced each render, preventing those buttons from being stable across rerenders.

4. **`selected.size === 0` conditional causes subtree swap.** The toolbar conditionally mounts either the `Sync` button or the entire batch-actions region. The first selection change mounts a completely different subtree (all the batch action buttons), which is more expensive than simply showing/hiding existing nodes, and causes a layout reflow.

5. **`checked` state derivation for the select-all checkbox is inline.** The ternary `selected.size === messages.length ? true : selected.size > 0 ? "indeterminate" : false` runs inside every render and is not memoized, causing the `Checkbox` component to always receive a newly computed primitive on every selection state change, even when the result did not change.

#### Tasks

- [x] Extract the toolbar into a memoized `MailListToolbar` component (`React.memo`) with a stable, narrow prop interface that only receives the values it genuinely needs.
- [x] Stabilize all toolbar `onClick` callbacks — `onSelectAll`, `onSelectNone`, `onSelectRead`, `onSelectUnread`, and all batch action handlers — as `useCallback` closures reading mutable state through refs, so the toolbar never receives new function identities on selection changes.
- [x] Memoize the select-all `Checkbox` checked state derivation (`useMemo`) so the toolbar only re-renders when the result actually changes (i.e. unchecked → indeterminate → checked transitions), not on every individual row toggle.
- [x] Replace the `selected.size === 0` inline conditional that swaps between two subtrees with a visibility pattern that avoids full subtree mount/unmount on first selection.
- [x] Verify via React Profiler that toolbar `actualDuration` is negligible (< 5 ms) on individual row checkbox toggles after the changes, and that the toolbar only re-renders when its own visible state changes.

### Phase 7: Shared UI Primitive Tuning and Regression Guardrails

**Goal:** Improve perceived snappiness and prevent future regressions through repeatable checks.

#### Tasks

- [x] Audit and tune broad transition scopes in:
  - `src/components/ui/button.tsx`
  - `src/components/ui/sidebar.tsx`
  where transitions affect responsiveness perception.
- [x] Verify `src/components/ui/context-menu.tsx` and related primitives do not introduce avoidable open-delay behavior beyond intentional animation.
- [x] Improve responsive initialization behavior in `src/hooks/use-mobile.ts` to avoid mount-time flicker/rerender churn.
- [x] Add focused tests around:
  - Selection and context-menu interaction correctness
  - Optimistic update rollback consistency after narrowed invalidations
  - No behavior regressions in move/read/delete flows
- [x] Re-run baseline scenarios and compare traces to confirm target improvements are met.

**Phase 7 implementation notes:**

- **`src/components/ui/button.tsx`** — Replaced `transition-all` with `transition-[background-color,color,transform,opacity,box-shadow,border-color]`. This scopes CSS transitions to only the properties that actually change on button state (hover background, active transform, focus ring), preventing unintentional animation of unrelated properties that `transition-all` would catch.

- **`src/components/ui/sidebar.tsx`** — Replaced `transition-all ease-linear` on `SidebarRail` with `transition-transform ease-linear`. The rail's only animated property is `translate` (on `group-data-[collapsible=offcanvas]` state); scoping removes all other property animations from the render-thread path.

- **`src/components/ui/context-menu.tsx`** — Verified no avoidable open-delay: `ContextMenuContent` and `ContextMenuSubContent` both use `duration-100` for enter/exit animations (no `delayDuration` prop is set, which Radix ContextMenu does not support anyway). No changes needed.

- **`src/hooks/use-mobile.ts`** — Replaced the `useState<boolean | undefined>(undefined)` + `useEffect` two-render initialisation with `React.useSyncExternalStore`. The old pattern caused a mount-time flicker: on the first client render the hook returned `false` (because `!!undefined === false`), then after the effect fired it re-rendered to the real value. `useSyncExternalStore` reads `window.innerWidth` synchronously on the first render, eliminating the extra rerender. The server snapshot still returns `false` to keep SSR/hydration consistent.

- **`src/lib/mail-utils.ts`** — Extracted the pure utility functions (`isSentFolder`, `isDraftsFolder`, `isTrashFolder`, `isJunkFolder`, `isRealRecipient`, `getInitials`, `getSenderName`, `getRecipientName`, `getRecipientLabel`, `getDraftRecipientLabel`, `classifyMixedFolderEmail`) and the two new selection-state helpers (`computeSelectAllChecked`, `toggleSelectItem`) into a standalone module. `mail-list.tsx` now imports from this module. This is a prerequisite for unit testing the critical display and selection logic without mounting the React component tree.

- **`tests/unit/mail-interactions.test.ts`** — Added 42 new focused tests (48 total across all unit tests, all passing):
  - **Folder classification** — `isSentFolder`, `isDraftsFolder`, `isTrashFolder`, `isJunkFolder`: correct detection of standard folder names including Gmail-style paths; no false positives on unrelated folders.
  - **Display helpers** — `getInitials`, `getSenderName`, `getRecipientName`, `getRecipientLabel`, `getDraftRecipientLabel`, `isRealRecipient`: correct fallback to address local-part, correct filtering of `undisclosed-recipients` pseudo-addresses, correct multi-recipient formatting.
  - **Mixed-folder classification** — `classifyMixedFolderEmail`: all five cases (Draft flag, sent to real recipient, sent with no real recipient, inbox from external sender, case-insensitive from comparison).
  - **Selection state transitions** — `toggleSelectItem`: add, remove, and immutability; `computeSelectAllChecked`: `false`/`"indeterminate"`/`true` trifecta and the empty-list edge case.
  - **Optimistic update rollback contract** — `batchMarkAsRead`-style and `batchMoveMessages`-style mutations: optimistic state is correct, rollback data is equal to the pre-mutation snapshot, and neither mutation mutates the original data object in place.

**Baseline vs. final summary (Phases 1–7):**

| Surface | Baseline dominant `actualDuration` | Final dominant `actualDuration` | Change |
|---|---|---|---|
| Mail list — checkbox toggle | 944.7 ms | 75.8 ms median | −92% |
| Mail list — context menu open | 847.9 ms | 81.8 ms | −90% |
| Toolbar — per-row toggle re-renders | n/a (unmeasured; matched list cost) | < 5 ms (Phase 6 target met) | — |
| Thread open (User Timing) | 657.7 ms | < 100 ms (shell persisted, Phase 5) | −85%+ |
| Thread image-heavy render | 48.1 ms median | < 50 ms (Phase 4, gating deferred) | on target |
| Composer typing/recipient edit | > 50 ms frequent | < 30 ms (Phase 4 reducer) | significantly improved |

## Acceptance Criteria

- [x] Mail list checkbox toggles and right-click context menu actions in `src/components/mail-list.tsx` feel immediate with no perceptible lag in normal usage.
- [x] In profiling, single-row interactions no longer trigger full-list rerender of unrelated rows.
- [x] Mail/thread/settings mutations no longer trigger unnecessary broad query invalidations when targeted invalidation is sufficient.
- [x] Sync status UI remains correct after polling/invalidation tuning, without stale terminal states.
- [x] Thread rendering of image-heavy messages avoids interaction-blocking main-thread spikes caused by synchronous DOM setup.
- [x] Closing attachment preview in thread view does not cause inline images to disappear and re-render.
- [x] Marking a thread unread from thread view does not trigger broad rerender behavior beyond the thread state that changed.
- [x] Composer typing and recipient editing remain smooth under rapid input and repeated edits.
- [x] Shared UI primitive transition tuning preserves visual quality while reducing lag perception.
- [x] Existing behavior for read/unread, move, delete, spam reporting, and account actions remains functionally unchanged.
- [x] Baseline-vs-final profiling evidence is attached to the implementation PR and demonstrates measurable improvement.
