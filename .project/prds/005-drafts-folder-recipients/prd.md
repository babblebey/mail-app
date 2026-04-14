---
title: "Drafts Folder: Show Recipients with Draft Suffix"
status: draft
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
  - type: prd
    url: .project/prds/004-sent-folder-recipients/prd.md
    description: "Prior PRD — Sent folder recipient display (completed)"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Drafts Folder: Show Recipients with Draft Suffix

## Description

When viewing the Drafts folder, each message row currently displays the **sender's** avatar and name — which is always the logged-in user. This provides no useful context for distinguishing between drafts. Users need to see **who the draft is addressed to**, similar to the Sent folder, but with a clear visual indicator that the message is a draft.

This PRD covers:

1. Detecting the Drafts folder in the mail list UI to switch display logic.
2. Rendering recipient names with a trailing ", Draft" suffix (analogous to the Sent folder's "To: " prefix, but distinct).
3. Rendering grouped avatars with recipient initials when recipients exist.
4. Handling edge cases: drafts with no recipients (special "no recipient" avatar and label) and drafts with no body (hide the snippet entirely).

### Design Decisions

- **Drafts folder detection by folder path heuristic**: A case-insensitive match on the folder path (contains `"draft"`) covers all major providers (Gmail `[Gmail]/Drafts`, Outlook `Drafts`, Apple Mail `Drafts`, generic `Drafts`). This mirrors the approach used for the Sent folder.
- **", Draft" suffix instead of prefix**: The Sent folder uses a "To: " prefix. For Drafts, a ", Draft" suffix creates a distinct visual pattern — e.g. `"Alice, Bob, Draft"` — making it immediately clear the message is unsent without conflating it with Sent folder entries.
- **"No recipient" state**: Drafts can exist before any recipient is entered. These display a pen icon avatar (reusing the already-imported `PenSquareIcon`) and a `"No recipient, Draft"` label to communicate the incomplete state.
- **Empty body / no snippet**: Drafts may have no body content yet. When `snippet` is empty or whitespace, the `"- snippet"` span is hidden entirely rather than showing a meaningless separator.
- **`(no subject)` handling**: The server already returns `"(no subject)"` for messages with empty subjects — no client-side change needed.
- **Reuse of Sent folder avatar pattern**: The `AvatarGroup` / `AvatarGroupCount` pattern from the Sent folder implementation is reused for drafts with recipients, keeping the UI consistent.

### User Stories

- **As a** user viewing my Drafts folder, **I want** to see the recipients' names on each draft row with a ", Draft" suffix, **so that** I can quickly identify who each draft is addressed to and that it is unsent.
- **As a** user viewing a draft with no recipients, **I want** to see a clear visual indicator (pen icon avatar and "No recipient, Draft" label), **so that** I can tell the draft has no addressee yet.
- **As a** user viewing a draft with no body, **I want** the snippet area to be empty rather than showing a meaningless separator, **so that** the list stays clean and informative.
- **As a** user viewing my Inbox, Sent, or other folders, **I want** the display to remain unchanged, **so that** the familiar layout is preserved.

## Implementation Plan

### Phase 1: Drafts Folder Detection & Display Helpers

**Goal:** Add utility functions that determine whether the current folder is a Drafts folder and format recipient names with the ", Draft" suffix.

#### Tasks

- [ ] Add `isDraftsFolder(folder: string): boolean` helper in `src/components/mail-list.tsx` — returns `true` when `folder.toLowerCase()` contains `"draft"`
- [ ] Add `getDraftRecipientLabel(to, cc, bcc): string` helper — combines `to`, `cc`, and `bcc` arrays, maps each to `getRecipientName()`, joins with `", "`, and appends `", Draft"`. Returns just `"Draft"` when there are no recipients.

### Phase 2: Grouped Recipient Avatars for Drafts

**Goal:** Replace the single sender avatar with recipient-aware avatars when viewing the Drafts folder.

#### Tasks

- [ ] In the message row avatar section of `src/components/mail-list.tsx`, add a Drafts folder branch:
  - When `isDraftsFolder(folder)` and recipients exist: render an `AvatarGroup` containing up to 2 `Avatar` components (one per recipient from the combined `to` + `cc` + `bcc` list), each showing initials from `getRecipientName()`. If there are more than 2 recipients, append an `AvatarGroupCount` showing `+N` for the remaining count.
  - When `isDraftsFolder(folder)` and no recipients exist: render a single `Avatar` containing a `PenSquareIcon` as the fallback, communicating "draft in progress with no recipient yet".
  - When not a Drafts or Sent folder: keep the existing single `Avatar` with sender initials (no changes).

### Phase 3: Recipient Name & Draft Suffix Display

**Goal:** Replace the sender name text with recipient names and a ", Draft" suffix when viewing the Drafts folder.

#### Tasks

- [ ] In the message row name section of `src/components/mail-list.tsx`:
  - When `isDraftsFolder(folder)`: display `getDraftRecipientLabel(mail.to, mail.cc, mail.bcc)` — e.g. `"Alice, Bob, Draft"` or `"No recipient, Draft"` when there are no recipients.
  - When not a Drafts folder: keep existing display logic (no changes).
- [ ] Update the checkbox `aria-label` to reference drafts — e.g. `"Select draft to Alice, Bob"` when recipients exist, or `"Select draft with no recipient"` when none exist.

### Phase 4: Conditional Snippet Display

**Goal:** Hide the message snippet for drafts that have no body content, keeping the list clean.

#### Tasks

- [ ] In the message row content section of `src/components/mail-list.tsx`:
  - When `isDraftsFolder(folder)` and `mail.snippet` is empty or whitespace-only: do not render the `"- {snippet}"` span.
  - For all other cases (non-Drafts folders, or Drafts with a non-empty snippet): keep existing snippet display (no changes).

## Acceptance Criteria

- [ ] Messages in the Drafts folder display recipient names (first name or email local part) with a trailing ", Draft" suffix instead of the sender name
- [ ] Messages in the Drafts folder with recipients display grouped avatars (`AvatarGroup`) with recipient initials — max 2 visible, `+N` overflow for additional recipients
- [ ] Messages in the Drafts folder with no recipients display a pen icon avatar and "No recipient, Draft" label
- [ ] Messages in the Drafts folder with no body content display no snippet text (no `"- "` separator)
- [ ] Messages in the Drafts folder with no subject continue to show `"(no subject)"` as provided by the server
- [ ] Messages in the Inbox, Sent, and all other non-Drafts folders continue to display as before (no visual changes)
- [ ] No TypeScript or lint errors after all changes
