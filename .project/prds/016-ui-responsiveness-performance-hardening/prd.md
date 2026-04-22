---
title: "UI Responsiveness and Interaction Performance Hardening"
status: in-progress
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
- [ ] Capture browser Performance panel traces for the same scenarios to identify main-thread blocking segments.
- [x] Document baseline metrics and target thresholds for interaction latency and render counts in PR notes for this PRD implementation.

Phase 1 instrumentation is implemented in code and the capture workflow/thresholds are documented in `.project/prds/016-ui-responsiveness-performance-hardening/phase-1-baseline-notes.md`. Baseline data has now been captured for mail-list, thread, and composer interactions: mail-list severely misses target (checkbox: `944.7 ms` dominant React commit, `936.6 ms` User Timing median; context menu: `847.9 ms` dominant React commit, `1206.2 ms` User Timing median), thread-open also misses target on User Timing median (`657.7 ms`) and image-heavy-render is median-pass (`48.1 ms`) with large outliers, and composer typing/recipient-edit traces miss target with frequent `> 50 ms` interaction durations and outliers above `100 ms`. Browser Performance traces are now captured for mail-list, thread-open, and composer interactions and confirm severe renderer-main long tasks (up to `1676.4 ms` in composer), while browser trace for thread image-heavy scenario is still pending, so Phase 1 remains open.

### Phase 2: Mail List Render-Path Hardening

**Goal:** Remove avoidable rerenders and expensive repeated derivations in the highest-traffic list interactions.

#### Tasks

- [ ] In `src/components/mail-list.tsx`, extract message row rendering into a memoized row component (e.g., `React.memo`) with stable props.
- [ ] Memoize high-frequency derived values, including:
  - Flattened messages array
  - Selected UID numeric array
  - Selected unread-state checks
  - Folder options used by move menus
- [ ] Replace callback patterns that depend on mutable `Set` references with stable updater forms to reduce handler recreation.
- [ ] Remove any render-time debug logging and other synchronous non-essential work from interaction paths.
- [ ] Re-profile checkbox and context-menu scenarios to verify reduced rerenders for unaffected rows.

### Phase 3: Query Invalidation and Sync Churn Optimization

**Goal:** Reduce unnecessary network and state churn that degrades perceived responsiveness.

#### Tasks

- [ ] Narrow invalidation scopes for mail mutations in:
  - `src/components/mail-list.tsx`
  - `src/components/mail-thread.tsx`
  - `src/app/dashboard/settings/page.tsx`
- [ ] Replace broad invalidations with targeted invalidation keys where possible (e.g., folder-scoped list invalidation).
- [ ] Revisit sync status polling cadence in:
  - `src/components/mail-list.tsx`
  - `src/app/dashboard/settings/page.tsx`
  to reduce refetch pressure during active sync without stale UX.
- [ ] Eliminate duplicate refetch/invalidation pathways tied to sync-completion effects.
- [ ] Validate that folder counts and read states remain eventually consistent after scope narrowing.

### Phase 4: Thread and Composer Responsiveness

**Goal:** Remove blocking work from thread rendering and reduce state-driven churn in compose workflows.

#### Tasks

- [ ] In `src/components/mail-thread.tsx`, defer or gate synchronous DOM-intensive image/shimmer setup to avoid blocking interaction frames.
- [ ] In `src/components/mail-thread.tsx`, memoize repeated recipient/display derivations used during rerenders.
- [ ] In `src/components/mail-composer.tsx`, reduce state fragmentation (single reducer or isolated memoized subcomponents).
- [ ] Stabilize composer event handlers for recipient edits, attachment interactions, and body/subject updates.
- [ ] Replace unstable list keys (where applicable) with deterministic keys for recipient chips and similar collections.

### Phase 5: Shared UI Primitive Tuning and Regression Guardrails

**Goal:** Improve perceived snappiness and prevent future regressions through repeatable checks.

#### Tasks

- [ ] Audit and tune broad transition scopes in:
  - `src/components/ui/button.tsx`
  - `src/components/ui/sidebar.tsx`
  where transitions affect responsiveness perception.
- [ ] Verify `src/components/ui/context-menu.tsx` and related primitives do not introduce avoidable open-delay behavior beyond intentional animation.
- [ ] Improve responsive initialization behavior in `src/hooks/use-mobile.ts` to avoid mount-time flicker/rerender churn.
- [ ] Add focused tests around:
  - Selection and context-menu interaction correctness
  - Optimistic update rollback consistency after narrowed invalidations
  - No behavior regressions in move/read/delete flows
- [ ] Re-run baseline scenarios and compare traces to confirm target improvements are met.

## Acceptance Criteria

- [ ] Mail list checkbox toggles and right-click context menu actions in `src/components/mail-list.tsx` feel immediate with no perceptible lag in normal usage.
- [ ] In profiling, single-row interactions no longer trigger full-list rerender of unrelated rows.
- [ ] Mail/thread/settings mutations no longer trigger unnecessary broad query invalidations when targeted invalidation is sufficient.
- [ ] Sync status UI remains correct after polling/invalidation tuning, without stale terminal states.
- [ ] Thread rendering of image-heavy messages avoids interaction-blocking main-thread spikes caused by synchronous DOM setup.
- [ ] Composer typing and recipient editing remain smooth under rapid input and repeated edits.
- [ ] Shared UI primitive transition tuning preserves visual quality while reducing lag perception.
- [ ] Existing behavior for read/unread, move, delete, spam reporting, and account actions remains functionally unchanged.
- [ ] Baseline-vs-final profiling evidence is attached to the implementation PR and demonstrates measurable improvement.
