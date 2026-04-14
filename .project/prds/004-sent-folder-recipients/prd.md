---
title: "Sent Folder: Show Recipients with Grouped Avatars"
status: draft
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
  - type: prd
    url: .project/prds/003-imap-fetch-folders-and-messages/prd.md
    description: "Prior PRD — IMAP fetch folders & messages (completed)"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Sent Folder: Show Recipients with Grouped Avatars

## Description

When viewing the Sent folder, each message row currently displays the **sender's** avatar and name — which is always the logged-in user. This provides no useful information for distinguishing between sent messages. Users need to see **who they sent to**, not who sent it.

This PRD covers:

1. Exposing the `cc` field in the `listMessages` API response (already available in the IMAP envelope but not returned).
2. Detecting the Sent folder in the mail list UI to switch display logic.
3. Rendering recipient display names (first name or email local part) instead of sender name.
4. Rendering grouped avatars (`AvatarGroup`) with recipient initials instead of a single sender avatar.

### Design Decisions

- **Sent folder detection by folder path heuristic**: A case-insensitive match on the folder path (contains `"sent"`) covers all major providers (Gmail `[Gmail]/Sent Mail`, Outlook `Sent Items`, Apple Mail `Sent Messages`, generic `Sent`). Threading `specialUse` metadata from the sidebar to the mail list is not worth the complexity for this use case.
- **First name only for display**: In list views, space is limited. Showing only the first name keeps rows compact. For email-only contacts, the local part (before `@`) is used.
- **Max 2 visible avatars in group**: Keeps the row compact within the existing avatar slot. A `+N` overflow badge communicates additional recipients without consuming more space.
- **`AvatarGroup` from existing component library**: The `AvatarGroup` and `AvatarGroupCount` components already exist in `src/components/ui/avatar.tsx` — no new UI primitives needed.
- **Fallback to sender display**: If a message has no `to` or `cc` recipients (e.g. BCC-only or corrupted), fall back to the existing sender display to avoid empty rows.

### User Stories

- **As a** user viewing my Sent folder, **I want** to see the recipients' names and avatars on each message row, **so that** I can quickly identify who I sent each email to.
- **As a** user viewing my Sent folder, **I want** to see grouped avatars when a message has multiple recipients, **so that** I can tell at a glance whether I sent to one person or many.
- **As a** user viewing my Inbox or other folders, **I want** the display to remain unchanged (sender info), **so that** the familiar layout is preserved.

## Implementation Plan

### Phase 1: Backend — Expose `cc` in `listMessages`

**Goal:** Include the `cc` recipients array in the `listMessages` API response so the UI has all recipient data needed for the Sent folder display.

#### Tasks

- [ ] Add `cc` field to the messages type in `src/server/api/routers/mail.ts` `listMessages` procedure, typed as `{ name: string; address: string }[]`
- [ ] Extract `cc` from `msg.envelope.cc` (same pattern as existing `to` extraction from `msg.envelope.to`)
- [ ] Include `cc` in the `messages.push()` call

### Phase 2: Frontend — Sent Folder Detection & Display Helpers

**Goal:** Add utility functions that determine whether the current folder is a Sent folder and format recipient names for compact display.

#### Tasks

- [ ] Add `isSentFolder(folder: string): boolean` helper in `src/components/mail-list.tsx` — returns `true` when `folder.toLowerCase()` contains `"sent"`
- [ ] Add `getDisplayName(contact: { name: string; address: string }): string` helper — returns the first word of `name` if the contact has a non-empty name, otherwise returns the local part of `address` (before `@`)
- [ ] Add `getRecipientLabel(to, cc): string` helper — combines `to` and `cc` arrays, maps each to `getDisplayName()`, and joins with `", "`

### Phase 3: Frontend — Grouped Recipient Avatars

**Goal:** Replace the single sender avatar with an `AvatarGroup` showing recipient initials when viewing the Sent folder.

#### Tasks

- [ ] Import `AvatarGroup` and `AvatarGroupCount` from `~/components/ui/avatar`
- [ ] In the message row avatar section of `src/components/mail-list.tsx`:
  - When `isSentFolder(folder)`: render an `AvatarGroup` containing up to 2 `Avatar` components (one per recipient from the combined `to` + `cc` list) with `size="sm"`, each showing initials from `getDisplayName()`. If there are more than 2 recipients, append an `AvatarGroupCount` showing `+N` for the remaining count.
  - When not a Sent folder: keep the existing single `Avatar` with sender initials (no changes)
- [ ] If the combined recipients list is empty, fall back to the existing sender avatar display

### Phase 4: Frontend — Recipient Name Display

**Goal:** Replace the sender name text with recipient names when viewing the Sent folder.

#### Tasks

- [ ] In the message row name section of `src/components/mail-list.tsx`:
  - When `isSentFolder(folder)` and recipients exist: display `getRecipientLabel(mail.to, mail.cc)` instead of `mail.from.name`
  - When not a Sent folder: keep existing `mail.from.name` display (no changes)
- [ ] Update the checkbox `aria-label` to reference recipients (e.g. `"Select mail to John, Jane"`) when in the Sent folder

## Acceptance Criteria

- [ ] The `listMessages` API response includes a `cc` field typed as `{ name: string; address: string }[]`
- [ ] Messages in the Sent folder display recipient names (first name or email local part) instead of the sender name
- [ ] Messages in the Sent folder display grouped avatars (`AvatarGroup`) with recipient initials — max 2 visible, `+N` overflow for additional recipients
- [ ] Messages in the Inbox and all other non-Sent folders continue to display sender name and single sender avatar (no visual changes)
- [ ] Messages with no `to` or `cc` recipients gracefully fall back to sender display
- [ ] No TypeScript or lint errors after all changes
