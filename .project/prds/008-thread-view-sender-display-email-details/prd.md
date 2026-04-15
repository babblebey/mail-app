---
title: "Thread View: Sender Display & Email Details Popover"
status: not-started
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
  - type: prd
    url: .project/prds/005-drafts-folder-recipients/prd.md
    description: "Prior PRD — Drafts folder recipient display (completed)"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Thread View: Sender Display & Email Details Popover

## Description

When viewing a message thread, the `MessageView` component in `src/components/mail-thread.tsx` has three display issues in its header area:

1. **Missing sender when name is empty**: When the sender has no display name (common for self-sent messages or system-generated mail), the sender line renders blank. The avatar initials also break because `getInitials("")` returns nothing.
2. **No email address shown alongside sender name**: When a sender name is present, users cannot see the underlying email address without inspecting headers. Standard email clients show the format `"Full Name <email@example.com>"`.
3. **No email metadata detail view**: The chevron icon next to the recipients line is non-interactive. Users expect clicking it to reveal a popover with full message metadata (from, to, cc, subject, date) — similar to Gmail's detail panel.

This PRD covers:

1. Always displaying a sender identifier — the name when available, falling back to the email address.
2. Showing the sender's email address in muted text following their name in angle brackets.
3. Adding a Popover component (via shadcn) triggered by the chevron icon, displaying full email metadata.

### Design Decisions

- **Sender fallback to email address**: When `message.from.name` is empty, the raw email address (`message.from.address`) is used as the primary display text. This ensures the sender line is never blank — including for self-sent messages where the IMAP server may omit the display name.
- **Avatar initials from email when name is absent**: When no name exists, initials are derived from the email local part (the portion before `@`), taking the first two characters uppercased. For example, `workplace@itbey.com` produces `"WO"`. This avoids empty or broken avatar badges.
- **"Full Name \<email\>" format**: When a name is present, the email address is rendered inline after the name wrapped in angle brackets — e.g. `"Olabode Lawal-Shittabey <babblebey@gmail.com>"`. The angle-bracketed email uses `text-muted-foreground` styling to keep the name visually dominant. When no name exists, only the email address is shown (no redundant angle bracket suffix of the same address).
- **Popover over dropdown or dialog**: A Radix `Popover` is the correct primitive — lightweight, positioned near its trigger, dismissible on outside click or Escape. It matches Gmail's email detail panel behavior and does not obscure the message content like a modal dialog would.
- **Popover content as a two-column grid**: The metadata is rendered as label–value pairs in a CSS grid (`grid-cols-[auto_1fr]`). Labels (`from:`, `to:`, `cc:`, `subject:`, `date:`) are right-aligned in `text-muted-foreground`; values are left-aligned in normal text. This mirrors the Gmail detail panel layout shown in the reference screenshot.
- **Conditional CC row**: The `cc:` row in the popover is only rendered when `message.cc` is non-empty, avoiding a blank or confusing row.
- **Detailed date format in popover**: The popover date uses a more detailed format than the header — e.g. `"Apr 14, 2026, 6:07 PM"` — giving users full timestamp context without cluttering the always-visible header.

### User Stories

- **As a** user viewing a message sent from my own account (or any sender without a display name), **I want** to see the sender's email address instead of a blank line, **so that** I can always identify who sent the message.
- **As a** user viewing a message thread, **I want** to see the sender's email address alongside their name in the format `"Full Name <email>"`, **so that** I can verify the sender's identity beyond just their display name.
- **As a** user viewing a message thread, **I want** to click the chevron icon next to the recipients line to see full message metadata (from, to, cc, subject, date) in a popover, **so that** I can inspect delivery details without leaving the thread view.

## Implementation Plan

### Phase 1: Add Popover UI Component

**Goal:** Install the shadcn Popover primitive so it is available for the email details panel.

#### Tasks

- [ ] Run `npx shadcn@latest add popover` to generate `src/components/ui/popover.tsx` with the project's `radix-luma` style preset

### Phase 2: Sender Display — Always Show Sender & Email Address

**Goal:** Ensure the sender line is never blank and always includes the email address.

#### Tasks

- [ ] In `src/components/mail-thread.tsx`, update the `getInitials()` call for the sender avatar to handle an empty name by deriving initials from the email local part (first two characters of the portion before `@`, uppercased)
- [ ] Update the sender name display (`message.from.name` on the `text-sm font-semibold` div) to show `message.from.address` when `message.from.name` is empty
- [ ] When `message.from.name` is present, append the email address after the name in angle brackets — render `<email>` in a `text-muted-foreground` span immediately following the name: `"Full Name <email@example.com>"`
- [ ] When `message.from.name` is absent, display only `message.from.address` as the primary text (no angle bracket suffix)

### Phase 3: Email Details Popover

**Goal:** Make the chevron icon next to the recipients line interactive, opening a popover with full message metadata.

#### Tasks

- [ ] Import `Popover`, `PopoverTrigger`, and `PopoverContent` from `~/components/ui/popover` in `src/components/mail-thread.tsx`
- [ ] Wrap the existing `ChevronDownIcon` (in the recipients line) inside a `Popover` + `PopoverTrigger` button — the button should be styled as `variant="ghost"` with compact sizing to match the existing inline appearance
- [ ] Build the `PopoverContent` with a two-column CSS grid layout (`grid-cols-[auto_1fr]`) containing:
  - **from:** — sender name and email address
  - **to:** — comma-separated list of recipient names and email addresses
  - **cc:** — comma-separated list of CC names and email addresses (row hidden when `message.cc` is empty)
  - **subject:** — the message subject line
  - **date:** — fully formatted date-time string (e.g. `"Apr 14, 2026, 6:07 PM"`)
- [ ] Style labels (`from:`, `to:`, etc.) in `text-muted-foreground text-xs` right-aligned; style values in `text-xs text-foreground`
- [ ] Add a `formatDetailDate()` helper for the popover date — format: `"Mon DD, YYYY, H:MM AM/PM"` — more detailed than the header's `formatDate()`

## Acceptance Criteria

- [ ] The sender line in `MessageView` always displays a visible identifier — the sender's name when available, or their email address when the name is empty
- [ ] When the sender has a display name, the email address is shown inline after it in angle brackets with `text-muted-foreground` styling — e.g. `"Olabode Lawal-Shittabey <babblebey@gmail.com>"`
- [ ] When the sender has no display name, only the email address is shown (no redundant angle brackets)
- [ ] The avatar displays initials derived from the email local part when the sender name is empty
- [ ] Clicking the chevron icon next to the recipients line opens a Popover with from, to, cc, subject, and date fields
- [ ] The CC row in the popover is hidden when the message has no CC recipients
- [ ] The popover dismisses on outside click or Escape keypress
- [ ] No TypeScript or lint errors after all changes
- [ ] No visual regressions in messages where the sender name is present and populated
