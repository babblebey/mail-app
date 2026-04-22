# Phase 1 Baseline Notes

## Status

Instrumentation is implemented in the client surfaces required for Phase 1:

- `src/components/mail-list.tsx`
- `src/components/mail-thread.tsx`
- `src/components/mail-composer.tsx`
- `src/components/performance-profiler.tsx`

Live baseline capture is still pending a configured local `.env` file, an authenticated session, and mailbox data representative of normal usage.

React Profiler results for mail-list scenarios were captured on 2026-04-21 from `profiling-data.04-21-2026.22-38-26.json`.

`window.__MAIL_APP_PERF__` interaction captures were also recorded for mail-list, thread, and composer scenarios, providing direct User Timing measurements for interaction latency.

Chrome Performance panel traces were captured on 2026-04-22 for thread-open and mail-list interactions from:

- `Trace-20260422T012824.json`
- `Trace-20260422T013642.json`
- `Trace-20260422T013730.json`

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
| mail-list.checkbox-toggle | `944.7 ms` dominant commit (`963.1 ms` across immediate 3-commit cluster) | `3` commits in observed cluster | `936.6 ms` median (`877.1 ms`, `936.6 ms`, `977.8 ms`) | Pending browser Performance trace | Updater was `MailList`; top fiber was `MailList` itself at `944.7 ms`, with two sibling fibers at `454.3 ms` and `454.1 ms`, indicating broad rerender work rather than a row-local update. |
| mail-list.context-menu-open | `847.9 ms` dominant commit (`926.6 ms` across initial 9-commit open cluster) | `9` commits in observed open cluster | `1206.2 ms` median (`1012.2 ms`, `1206.2 ms`, `1399.7 ms`) | Pending browser Performance trace | Initial commit was driven by `ContextMenu` + `MailList`; top fiber was `MailList` at `847.9 ms`, with two sibling fibers at `441.4 ms` and `441.2 ms`, followed by menu/presence commits from `6.3 ms` to `31.2 ms`. |
| mail-thread.thread-open | `86.9 ms` dominant `mail-thread.surface` mount commit (`92.9 ms` median across mount+follow-up pairs) | `2` commits per observed open (`mount` + `nested-update`) | `657.7 ms` median (`187.8 ms`, `287.9 ms`, `1027.5 ms`, `1302.1 ms`) | Pending browser Performance trace | Render cost inside `mail-thread.surface` is moderate, but end-to-end open latency is high and highly variable, indicating non-render wait (data/navigation/network) dominates worst-case opens. |
| mail-thread.image-heavy-render | `2.5 ms` dominant `mail-thread.message-body` mount commit (`0.8 ms`, `0.8 ms`, `2.5 ms`) | `1` commit per observed message-body mount | `48.1 ms` median (`40.5 ms`, `44.3 ms`, `47.4 ms`, `48.8 ms`, `181.3 ms`, `217.9 ms`) | Pending browser Performance trace | Median meets target, but high outliers (`181.3 ms`, `217.9 ms`) show occasional heavy-path stalls that need confirmation in browser Performance traces. |
| mail-composer.typing | `~33-42 ms` typical `mail-composer.surface` update commits with spikes up to `~91.6 ms` | `1` composer update commit per keystroke (plus paired `mail-list.surface` update due to shared subtree) | Subject median `~81 ms`; body median `~84 ms`; body outliers up to `194.4 ms` | Pending browser Performance trace | Consistently above `<= 16 ms` target; recurrent `> 50 ms` durations indicate interaction-path pressure during rapid input. |
| mail-composer.recipient-edit | `~19-46 ms` typical `mail-composer.surface` update commits with spikes up to `~116.9 ms` | `1` composer update commit per edit action (plus paired `mail-list.surface` update due to shared subtree) | `to-input` median `~82 ms` with outliers up to `285.8 ms`; `add-recipient` `~85.8-107.5 ms`; `remove-recipient` `49.1 ms` | Pending browser Performance trace | Misses `<= 50 ms` target on most add/type actions with multiple extreme spikes during recipient entry bursts. |

## Browser Trace Snapshot (2026-04-22)

The table below summarizes the captured Chrome traces at file level.

| Trace file | Scenario group | RunTask count (all threads) | Long tasks >= 50 ms (all threads) | Renderer main long tasks >= 50 ms | Max renderer main RunTask | Dropped frame events |
| --- | --- | --- | --- | --- | --- | --- |
| `Trace-20260422T012824.json` | Mail-list / thread-open capture set | `21405` | `8` | `8` | `641.0 ms` | `15` |
| `Trace-20260422T013642.json` | Mail-list / thread-open capture set | `10715` | `5` | `3` | `860.4 ms` | `58` |
| `Trace-20260422T013730.json` | Mail-list / thread-open capture set | `8592` | `5` | `5` | `1112.1 ms` | `2` |

All three traces show renderer-main long tasks well above the `>= 50 ms` threshold, confirming main-thread blocking during these captured interactions.

## Current Findings

- The checkbox-toggle capture materially misses the `<= 50 ms` target in both sources: React dominant commit (`944.7 ms`) and User Timing median (`936.6 ms`).
- The context-menu-open capture materially misses the `<= 50 ms` target in both sources: React dominant commit (`847.9 ms`) and User Timing median (`1206.2 ms`).
- The combined evidence strongly indicates full-surface rerender cost in the interaction path, not just menu animation overhead.
- The thread-open capture materially misses the `<= 120 ms` target on User Timing median (`657.7 ms`) with wide variance (`187.8 ms` to `1302.1 ms`), even though the measured `mail-thread.surface` render commits are much smaller (`86.9 ms` dominant mount).
- The image-heavy-render capture meets the `<= 120 ms` median target (`48.1 ms`) but has major outliers (`181.3 ms`, `217.9 ms`), so it is not yet stable.
- The composer typing capture materially misses the `<= 16 ms` target, with subject/body interaction medians around `~81-84 ms` and body outliers up to `194.4 ms`.
- The composer recipient-edit capture materially misses the `<= 50 ms` target for `to-input` and `add-recipient` actions (`~82 ms` median `to-input`, outliers up to `285.8 ms`; adds up to `107.5 ms`), while `remove-recipient` was near-threshold (`49.1 ms`) in the observed run.
- Browser traces for thread-open and mail-list interactions confirm severe main-thread blocking, with renderer-main long tasks from `641.0 ms` to `1112.1 ms` and non-zero dropped-frame events across runs.
- Browser traces are still pending for thread image-heavy render and composer scenarios.

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

The repository does not currently include a usable `.env` file or mailbox fixture data, so the remaining live traces required by Phase 1 cannot be captured in this workspace without local environment setup. Mail-list and thread-open browser traces plus mail-list/thread/composer `window.__MAIL_APP_PERF__` traces are now available, but browser traces for thread image-heavy render and composer scenarios are still required.