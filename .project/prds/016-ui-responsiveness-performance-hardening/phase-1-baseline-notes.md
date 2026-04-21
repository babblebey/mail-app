# Phase 1 Baseline Notes

## Status

Instrumentation is implemented in the client surfaces required for Phase 1:

- `src/components/mail-list.tsx`
- `src/components/mail-thread.tsx`
- `src/components/mail-composer.tsx`
- `src/components/performance-profiler.tsx`

Live baseline capture is still pending a configured local `.env` file, an authenticated session, and mailbox data representative of normal usage.

## How To Capture

1. Create a local `.env` from `.env.example` and configure the database/auth settings.
2. Start the app with `pnpm dev`.
3. Open a mailbox route with `?perf=1` appended to the URL, for example `/dashboard?folder=INBOX&perf=1`.
4. Open React DevTools Profiler and record each scenario below.
5. Open Chrome/Edge Performance panel and record the same scenario while `?perf=1` is enabled so the User Timing marks appear in the trace.
6. After each run, inspect `window.__MAIL_APP_PERF__` in the browser console to capture interaction durations and render timings.

## Required Scenarios

### Mail list

- `mail-list.checkbox-toggle`: toggle a single row checkbox in `src/components/mail-list.tsx`
- `mail-list.context-menu-open`: right-click a single row in `src/components/mail-list.tsx`

### Thread view

- `mail-thread.thread-open`: open a thread from the list into `src/components/mail-thread.tsx`
- `mail-thread.image-heavy-render`: open an HTML message with multiple inline images in `src/components/mail-thread.tsx`

### Composer

- `mail-composer.typing`: type rapidly in subject and body fields in `src/components/mail-composer.tsx`
- `mail-composer.recipient-edit`: type, add, and remove recipients in `src/components/mail-composer.tsx`

## Baseline Metrics Template

Record each scenario with at least 3 runs and fill in the median values below.

| Scenario | React Profiler actualDuration | React Profiler commit count | User Timing interaction duration | Main-thread long task observed | Notes |
| --- | --- | --- | --- | --- | --- |
| mail-list.checkbox-toggle | Pending local capture | Pending local capture | Pending local capture | Pending local capture | |
| mail-list.context-menu-open | Pending local capture | Pending local capture | Pending local capture | Pending local capture | |
| mail-thread.thread-open | Pending local capture | Pending local capture | Pending local capture | Pending local capture | |
| mail-thread.image-heavy-render | Pending local capture | Pending local capture | Pending local capture | Pending local capture | |
| mail-composer.typing | Pending local capture | Pending local capture | Pending local capture | Pending local capture | |
| mail-composer.recipient-edit | Pending local capture | Pending local capture | Pending local capture | Pending local capture | |

## Target Thresholds

These thresholds define the pass/fail bar for the follow-up optimization phases.

| Scenario | Target interaction duration | Target React commits | Target render scope | Target main-thread behavior |
| --- | --- | --- | --- | --- |
| mail-list.checkbox-toggle | <= 50 ms median | 1 user-visible commit | Touched row plus toolbar only | No long task >= 50 ms |
| mail-list.context-menu-open | <= 50 ms median | 1 user-visible commit | Target row plus menu only | No long task >= 50 ms |
| mail-thread.thread-open | <= 120 ms median after data is available | <= 2 commits after data resolves | Thread shell plus opened message only | No long task >= 50 ms during reveal |
| mail-thread.image-heavy-render | <= 120 ms median | <= 2 commits for body setup | Message body subtree only | No synchronous DOM setup block >= 50 ms |
| mail-composer.typing | <= 16 ms median per keystroke | 1 commit per keystroke | Edited field subtree only | No long task >= 50 ms |
| mail-composer.recipient-edit | <= 50 ms median | <= 1 commit per add/remove action | Recipient field subtree only | No long task >= 50 ms |

## Current Blocker

The repository does not currently include a usable `.env` file or mailbox fixture data, so the live baseline traces required by Phase 1 cannot be captured in this workspace without local environment setup.