---
title: "Junk Folder: Context-Aware Display by Email Origin"
status: draft
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
  - type: prd
    url: .project/prds/006-trash-folder-context-aware-display/prd.md
    description: "Prior PRD — Trash folder context-aware display (completed)"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Junk Folder: Context-Aware Display by Email Origin

## Description

The Junk (Spam) folder currently renders every message row using the default Inbox display style — sender avatar and sender name — regardless of the email's origin. Just like the Trash folder before PRD-006, a junked draft looks identical to a junked sent message or a junked inbox message.

PRD-006 solved this exact problem for the Trash folder by classifying each trashed email by its origin and rendering it with the appropriate display style (Inbox, Sent, or Drafts). This PRD applies the same context-aware display logic to the Junk folder, since Junk is also a mixed-origin folder — the mail server (or the user) can move messages from any folder into Junk.

Additionally, the existing `classifyTrashEmail` helper is poorly named now that it serves multiple folders. This PRD renames it to `classifyMixedFolderEmail` for clarity.

### What is the Junk folder?

The Junk (or Spam) folder is a standard IMAP special-use folder (`\Junk` per RFC 6154) where:

- The mail server **automatically moves** messages it identifies as spam or unsolicited email.
- The user **manually marks** messages as junk/spam, causing them to be moved to this folder.
- Some mail clients and server-side rules can also route messages here based on custom filters.

Like Trash, the Junk folder collects messages from **mixed origins**: a spam-flagged inbox message, an auto-flagged sent reply, or even a draft could end up here. The same per-message origin classification is needed.

### Classification Logic

The classification logic is identical to the Trash folder's (PRD-006). Each message in the Junk folder is classified using data already available in the `listMessages` API response:

| Priority | Condition | Origin | Display Style |
|----------|-----------|--------|---------------|
| 1 | Message `flags` array contains `\\Draft` | Drafts | Draft-style (pen icon or recipient avatars, ", Draft" red suffix, hidden empty snippet) |
| 2 | `from.address` matches any of the user's mail account email addresses (case-insensitive), no `\\Draft` flag | Sent | Sent-style (recipient avatar group, "To: " prefix) |
| 3 | Everything else | Inbox | Inbox-style (sender avatar, sender name) |

The existing `classifyTrashEmail` function already implements this logic. It is reused as-is (after renaming) — no new classification code is needed.

### Design Decisions

- **Junk folder detection by folder path heuristic**: A case-insensitive match on the folder path — contains `"junk"` or `"spam"` — covers all major providers (Gmail `[Gmail]/Spam`, Outlook `Junk Email`, Apple Mail `Junk`, generic `Junk`/`Spam`).
- **Reuse of `classifyTrashEmail` (renamed to `classifyMixedFolderEmail`)**: The origin classification logic is identical for Trash and Junk. Rather than duplicating it, the existing function is renamed to reflect its broader purpose and called from both Trash and Junk code paths.
- **Junk-specific row icon**: The Trash folder uses `Trash2Icon` on each message row. The Junk folder uses `AlertOctagonIcon` — the same icon shown in the sidebar navigation for the `\Junk` special-use folder — so users can visually distinguish Junk rows from Trash rows.
- **No backend changes required**: All data needed for classification (`flags`, `from.address`) is already returned by `listMessages`. The user's email addresses are already available via `mailAccount.list`. This is a purely frontend change.
- **No changes to Inbox, Sent, Drafts, Trash, or other folders**: Existing display behavior is preserved.

### User Stories

- **As a** user viewing my Junk folder, **I want** junked inbox messages to display with the sender's name and avatar, **so that** I can identify who sent me the email.
- **As a** user viewing my Junk folder, **I want** junked sent messages to display with recipient names and grouped avatars (like the Sent folder), **so that** I can identify who I sent the email to.
- **As a** user viewing my Junk folder, **I want** junked drafts to display with recipient names, a ", Draft" suffix, and the pen icon for no-recipient drafts (like the Drafts folder), **so that** I can identify incomplete messages and their intended recipients.
- **As a** user viewing my Junk folder, **I want** a junk icon (`AlertOctagonIcon`) on each row, **so that** I have a visual cue distinguishing Junk from other mixed-origin folders like Trash.
- **As a** user viewing my Inbox, Sent, Drafts, Trash, or other folders, **I want** the display to remain unchanged, **so that** the familiar layout is preserved.

## Implementation Plan

### Phase 1: Rename `classifyTrashEmail` to `classifyMixedFolderEmail`

**Goal:** Rename the existing origin-classification function to reflect its broader purpose, since it now serves both Trash and Junk folders.

#### Tasks

- [x] Rename `classifyTrashEmail` to `classifyMixedFolderEmail` in `src/components/mail-list.tsx` — update the function declaration and the call site in the `displayMode` ternary (where `isTrashFolder(folder)` calls the function)

### Phase 2: Junk Folder Detection

**Goal:** Add a Junk folder detection helper, mirroring the existing `isTrashFolder` and `isDraftsFolder` patterns.

#### Tasks

- [x] Add `isJunkFolder(folder: string): boolean` helper in `src/components/mail-list.tsx` — returns `true` when `folder.toLowerCase()` contains `"junk"` or `"spam"` (covers Gmail's "Spam", Outlook's "Junk Email", Apple Mail "Junk", generic "Junk"/"Spam")
- [x] Position the helper alongside the existing folder-detection functions (`isSentFolder`, `isDraftsFolder`, `isTrashFolder`)

### Phase 3: Extend `displayMode` to Cover Junk Folder

**Goal:** Make the Junk folder use per-message classification, identical to the Trash folder.

#### Tasks

- [x] Update the `displayMode` ternary in the `MailList` component to call `classifyMixedFolderEmail(mail, userEmails)` when `isJunkFolder(folder)`, giving Junk the same priority as Trash (before the `isDraftsFolder` / `isSentFolder` / fallback chain)

### Phase 4: Junk Folder Row Icon

**Goal:** Add a per-row junk icon as a visual cue, matching the sidebar's Junk folder icon.

#### Tasks

- [ ] Import `AlertOctagonIcon` from `lucide-react` in `src/components/mail-list.tsx` (not currently imported)
- [ ] Add an `AlertOctagonIcon` rendering block alongside the existing `Trash2Icon` conditional — render when `isJunkFolder(folder)` is true, using the same styling as the Trash icon (`size-4 shrink-0 text-muted-foreground`)
- [ ] Non-Junk folders are unaffected (icon only renders when `isJunkFolder(folder)` is true)

### Phase 5: Accessible Labels for Junk

**Goal:** Verify that checkbox aria-labels in the Junk folder correctly reflect the classified origin of each message.

#### Tasks

- [ ] Confirm that the existing `aria-label` logic keys off `displayMode` (not `isTrashFolder`) — since it already does, Junk rows will inherit origin-aware labels automatically with no code changes needed
- [ ] Verify by inspecting: `"drafts"` → `"Select draft to/with no recipient"`, `"sent"` → `"Select mail to ..."`, `"inbox"` → `"Select mail from ..."`

## Acceptance Criteria

- [ ] Messages in the Junk folder that have the `\\Draft` flag display with Drafts-style rendering (recipient names with ", Draft" suffix, grouped avatars or pen icon, hidden empty snippet)
- [ ] Messages in the Junk folder where `from.address` matches any of the user's mail account emails (and no `\\Draft` flag) display with Sent-style rendering (recipient names with "To: " prefix, grouped avatars)
- [ ] Messages in the Junk folder that match neither condition display with Inbox-style rendering (sender avatar and sender name)
- [ ] Each message row in the Junk folder displays an `AlertOctagonIcon` (matching the sidebar Junk icon), positioned between the unread indicator and the avatar
- [ ] Drafts with no recipients in Junk display the pen icon avatar and "No recipient, Draft" label
- [ ] Drafts with no body content in Junk display no snippet text
- [ ] Checkbox aria-labels in Junk reflect the classified origin of each message
- [ ] The `classifyTrashEmail` function has been renamed to `classifyMixedFolderEmail` and both Trash and Junk code paths use the renamed function
- [ ] Messages in the Inbox, Sent, Drafts, Trash, and all other non-Junk folders continue to display exactly as before (no visual changes)
- [ ] Classification correctly handles multiple mail accounts (sent detection compares against all account emails)
- [ ] No TypeScript or lint errors after all changes
