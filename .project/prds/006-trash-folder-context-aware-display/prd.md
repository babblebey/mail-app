---
title: "Trash Folder: Context-Aware Display by Email Origin"
status: in-progress
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
  - type: prd
    url: .project/prds/004-sent-folder-recipients/prd.md
    description: "Prior PRD — Sent folder recipient display (completed)"
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

# Trash Folder: Context-Aware Display by Email Origin

## Description

When viewing the Trash folder, every message row currently uses the default Inbox display style — sender avatar and sender name — regardless of where the email was deleted from. A deleted draft looks identical to a deleted sent message or a deleted inbox message. This makes the Trash folder difficult to scan because the user cannot tell at a glance what kind of message each row represents.

The Inbox, Sent, and Drafts folders each have distinct, purpose-built display styles (sender info, recipient "To: " prefix, and recipient ", Draft" suffix respectively). This PRD brings those same display styles into the Trash folder by **classifying each trashed email by its origin** and rendering it accordingly.

### Classification Logic

Each message in the Trash folder is classified into one of three origin categories using data already available in the `listMessages` API response:

| Priority | Condition | Origin | Display Style |
|----------|-----------|--------|---------------|
| 1 | Message `flags` array contains `\\Draft` | Drafts | Draft-style (pen icon or recipient avatars, ", Draft" red suffix, hidden empty snippet) |
| 2 | `from.address` matches any of the user's mail account email addresses (case-insensitive), no `\\Draft` flag | Sent | Sent-style (recipient avatar group, "To: " prefix) |
| 3 | Everything else | Inbox | Inbox-style (sender avatar, sender name) |

**Why this works:**

- **`\\Draft` flag**: This is a standard IMAP message flag (`\Draft` per RFC 3501 §2.3.2) that is set on messages stored in the Drafts folder. Critically, IMAP servers **preserve message flags when messages are moved between folders** (including to Trash). This is the single most reliable signal for identifying a deleted draft.
- **`from` address comparison**: Sent messages always have the user's own email address in the `From` header. By comparing `from.address` against the email addresses of all the user's configured mail accounts, we can identify messages the user sent. Since drafts are already captured by the `\\Draft` flag (higher priority), this branch only matches genuinely sent messages.
- **Fallback to Inbox style**: Any message that is neither a draft nor sent by the user is a received message — display it with sender info.

### Design Decisions

- **Trash folder detection by folder path heuristic**: A case-insensitive match on the folder path (contains `"trash"`) covers all major providers (Gmail `[Gmail]/Trash`, Outlook `Deleted Items`/`Trash`, Apple Mail `Trash`, generic `Trash`). This mirrors the approach used for Sent and Drafts folder detection. Note: Outlook's `Deleted Items` does not contain "trash" — an additional check for `"deleted"` is included to cover this provider.
- **Per-message classification instead of per-folder**: Unlike Inbox/Sent/Drafts where all messages share one display mode, Trash requires per-message classification because it contains a mix of origins. The display rendering is refactored from folder-level branching to a per-message `displayMode` approach.
- **`\\Draft` flag takes priority over `from` match**: A draft authored by the user would match both the `\\Draft` flag check and the `from` address check. The `\\Draft` flag is checked first so drafts are never misclassified as sent messages.
- **Multiple mail accounts**: The user may have multiple configured mail accounts. The `from` address is compared against **all** account email addresses (via `api.mailAccount.list`), not just the default account. This ensures sent detection works regardless of which account the message was sent from.
- **Reuse of existing display patterns**: No new visual components are introduced. The three display branches (inbox, sent, drafts) already exist in `mail-list.tsx` — they are extracted into a shared rendering path parameterized by `displayMode`.
- **No backend changes required**: All data needed for classification (`flags`, `from.address`) is already returned by `listMessages`. The user's email addresses are already available via `mailAccount.list`. This is a purely frontend change.
- **Fallback for servers that strip `\\Draft` flag on move**: Rare, but some non-compliant servers may strip the `\\Draft` flag when moving to Trash. As a safety net: if `from` matches the user's email AND there are zero recipients (no `to`, `cc`, or `bcc` after filtering `undisclosed-recipients`), classify as a draft. This covers the most obvious edge case without overcomplicating the logic.

### User Stories

- **As a** user viewing my Trash folder, **I want** deleted inbox messages to display with the sender's name and avatar, **so that** I can identify who sent me the email.
- **As a** user viewing my Trash folder, **I want** deleted sent messages to display with recipient names and grouped avatars (like the Sent folder), **so that** I can identify who I sent the email to.
- **As a** user viewing my Trash folder, **I want** deleted drafts to display with recipient names, a ", Draft" suffix, and the pen icon for no-recipient drafts (like the Drafts folder), **so that** I can identify incomplete messages and their intended recipients.
- **As a** user viewing my Inbox, Sent, Drafts, or other folders, **I want** the display to remain unchanged, **so that** the familiar layout is preserved.

## Implementation Plan

### Phase 1: Trash Folder Detection & Mail Account Data Access

**Goal:** Add a Trash folder detection helper and make the user's mail account email addresses available in the `MailList` component for origin classification.

#### Tasks

- [x] Add `isTrashFolder(folder: string): boolean` helper in `src/components/mail-list.tsx` — returns `true` when `folder.toLowerCase()` contains `"trash"` or `"deleted"` (to cover Outlook's `Deleted Items`)
- [x] Add `api.mailAccount.list.useQuery()` call in the `MailList` component to fetch the user's configured mail accounts
- [x] Extract the list of user email addresses from the accounts query result (e.g. `accounts.map(a => a.email.toLowerCase())`) for use in classification

### Phase 2: Email Origin Classification

**Goal:** Implement a per-message classification function that determines the origin of each trashed email.

#### Tasks

- [x] Add `classifyTrashEmail(mail, userEmails: string[]): "inbox" | "sent" | "drafts"` helper in `src/components/mail-list.tsx`:
  - If `mail.flags` includes `"\\Draft"` → return `"drafts"`
  - Else if `mail.from.address.toLowerCase()` is found in `userEmails` and no `\\Draft` flag → return `"sent"`
  - Else → return `"inbox"`
- [x] Add draft-flag-stripped fallback: if `from` matches user email AND the combined `to` + `cc` + `bcc` list (after `isRealRecipient()` filtering) is empty → return `"drafts"` (covers servers that strip `\\Draft` on move)

### Phase 3: Refactor Display Rendering to Support Per-Message Mode

**Goal:** Extract the three existing display branches (inbox, sent, drafts) into a reusable rendering path that accepts a `displayMode` parameter, enabling per-message display in the Trash folder.

#### Tasks

- [ ] Determine the `displayMode` for each message row:
  - If `isTrashFolder(folder)`: call `classifyTrashEmail(mail, userEmails)` to get the mode per message
  - If `isDraftsFolder(folder)`: mode is `"drafts"` for all messages
  - If `isSentFolder(folder)`: mode is `"sent"` for all messages
  - Otherwise: mode is `"inbox"` for all messages
- [ ] Refactor the **avatar section** to render based on `displayMode` instead of folder checks:
  - `"inbox"` → single `Avatar` with sender initials
  - `"sent"` → `AvatarGroup` with recipient initials (max 2 + overflow count)
  - `"drafts"` → `AvatarGroup` with recipient initials if recipients exist; `PenSquareIcon` avatar if none
- [ ] Refactor the **name/label section** to render based on `displayMode`:
  - `"inbox"` → `getSenderName(mail.from)`
  - `"sent"` → `getRecipientLabel(to, cc, bcc)`
  - `"drafts"` → `getDraftRecipientLabel(to, cc, bcc)` with red ", Draft" suffix; `"No recipient, Draft"` if none
- [ ] Refactor the **snippet section** to respect `displayMode`:
  - `"drafts"` with empty/whitespace snippet → hide the snippet span
  - All other modes → show snippet as normal

### Phase 4: Accessible Labels for Trash

**Goal:** Update checkbox aria-labels in the Trash folder to reflect the classified origin of each message.

#### Tasks

- [ ] Update checkbox `aria-label` generation to use `displayMode`:
  - `"inbox"` → `"Select mail from {senderName}"`
  - `"sent"` → `"Select mail to {recipientLabel}"`
  - `"drafts"` with recipients → `"Select draft to {recipientLabel}"`
  - `"drafts"` with no recipients → `"Select draft with no recipient"`

## Acceptance Criteria

- [ ] Messages in the Trash folder that have the `\\Draft` flag display with Drafts-style rendering (recipient names with ", Draft" suffix, grouped avatars or pen icon, hidden empty snippet)
- [ ] Messages in the Trash folder where `from.address` matches any of the user's mail account emails (and no `\\Draft` flag) display with Sent-style rendering (recipient names with "To: " prefix, grouped avatars)
- [ ] Messages in the Trash folder that match neither condition display with Inbox-style rendering (sender avatar and sender name)
- [ ] Drafts with no recipients in Trash display the pen icon avatar and "No recipient, Draft" label
- [ ] Drafts with no body content in Trash display no snippet text
- [ ] Checkbox aria-labels in Trash reflect the classified origin of each message
- [ ] Messages in the Inbox, Sent, Drafts, and all other non-Trash folders continue to display exactly as before (no visual changes)
- [ ] Classification correctly handles multiple mail accounts (sent detection compares against all account emails)
- [ ] No TypeScript or lint errors after all changes
