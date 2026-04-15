---
title: "Mail List: Group Actions & Smart Selection"
status: in-progress
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
  - type: prd
    url: .project/prds/003-imap-fetch-folders-and-messages/prd.md
    description: "Prior PRD — IMAP fetch folders & messages (listMessages, markAsRead, toggleStar mutations)"
  - type: prd
    url: .project/prds/010-thread-view-message-actions-dropdown/prd.md
    description: "Prior PRD — Thread view message actions dropdown (moveMessage mutation, listFolders query, per-message actions pattern)"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Mail List: Group Actions & Smart Selection

## Description

The mail list toolbar currently renders a static set of buttons — Archive, Folder, Delete, and a three-dots More menu — regardless of whether any messages are selected. These buttons are non-functional placeholders. Users have no way to perform bulk operations on selected messages from the list view.

This PRD replaces the static toolbar with a contextual, selection-aware toolbar. When no messages are selected, only a **Refresh** button is shown (to re-fetch the current folder). When one or more messages are selected, the toolbar reveals batch action buttons: **Delete** (move to Trash), **Report Spam** (move to Junk), **Mark as Read**, **Mark as Unread**, and a **Move To** submenu listing all IMAP folders. A **smart selection dropdown** is also added next to the select-all checkbox, allowing the user to quickly select **All**, **None**, **Read**, or **Unread** messages from the loaded list.

New batch backend mutations are required to support these operations efficiently — IMAP natively supports UID sequence sets (e.g. `"1,2,3"`), so a single IMAP connection handles all selected messages in one call rather than opening N separate connections.

### Design Decisions

- **Contextual toolbar replaces static placeholders**: The current Archive, Folder, Delete, and More buttons are non-functional. They are removed entirely and replaced with a toolbar that adapts to selection state — Refresh when idle, batch actions when messages are selected. This matches the Gmail-style UX shown in the reference screenshot.
- **Batch endpoints over looping single mutations**: The existing `markAsRead` and `moveMessage` mutations accept a single UID. Rather than firing N mutations for N selected messages, new `batchMarkAsRead` and `batchMoveMessages` mutations accept an array of UIDs and use IMAP's native UID sequence set support (comma-joined string like `"1,2,3"`) for a single server operation per call. This is significantly more efficient.
- **Delete means "move to Trash"**: Consistent with the thread view (PRD 010). Clicking Delete on selected messages moves them to the user's Trash folder via IMAP `messageMove`. This is non-destructive.
- **Report Spam means "move to Junk"**: Consistent with the thread view (PRD 010). No spam-reporting headers or feedback loops are sent — it is purely a folder-move operation.
- **Dynamic Trash/Junk folder path resolution**: Consistent with the thread view (PRD 010). The component queries `listFolders` and resolves the correct paths by matching `specialUse === "\\Trash"` and `specialUse === "\\Junk"`.
- **Smart selection operates on loaded messages only**: The selection dropdown (All, None, Read, Unread) operates on whatever messages are currently loaded via infinite scroll, not the entire server-side mailbox. This avoids requiring a separate server query for filtered selection.
- **Selection cleared after batch actions**: After any successful batch mutation, the selection set is cleared and `listMessages` is invalidated to reflect the updated state.
- **Checkbox + ChevronDown pattern for smart selection**: The existing `ChevronDownIcon` button next to the select-all checkbox becomes the trigger for the smart selection dropdown. This mirrors Gmail's selection dropdown pattern shown in the reference screenshot.
- **Write Message button always visible**: The compose button remains in the toolbar regardless of selection state, anchored to the right side.
- **Toast feedback and undo support are out of scope**: These are planned as future enhancements. Batch operations silently succeed and rely on the list refresh to communicate the result.
- **Move To submenu follows the thread view pattern**: The "Move To" action uses a `DropdownMenuSub` with a `DropdownMenuSubContent` listing all folders except the current one, identical to the pattern established in PRD 010.

### User Stories

- **As a** user viewing my inbox, **I want** to select multiple messages and delete them in one action, **so that** I can quickly clean up my mailbox without opening each message individually.
- **As a** user viewing my inbox, **I want** to select multiple messages and report them as spam in one action, **so that** they are moved to my Junk folder efficiently.
- **As a** user viewing my inbox, **I want** to select multiple messages and mark them as read or unread in one action, **so that** I can manage my read state in bulk.
- **As a** user viewing my inbox, **I want** to select multiple messages and move them to a specific folder in one action, **so that** I can organise my mail without handling messages one by one.
- **As a** user viewing my inbox, **I want** a smart selection dropdown that lets me select all read or all unread messages, **so that** I can quickly target a subset of messages for bulk actions.
- **As a** user viewing my inbox with no messages selected, **I want** to see a Refresh button instead of irrelevant action buttons, **so that** I can re-fetch my folder without confusion about non-functional controls.

## Implementation Plan

### Phase 1: Backend — Batch tRPC Mutations

**Goal:** Add two new batch mutations to the mail router that accept an array of UIDs and perform IMAP operations on all of them in a single connection.

#### Tasks

- [x] In `src/server/api/routers/mail.ts`, add a `batchMarkAsRead` mutation to the `mailRouter` with the following specification:
  - **Input schema**: `{ accountId: z.string().cuid().optional(), folder: z.string().min(1), uids: z.array(z.number().int().positive()).min(1), read: z.boolean() }`
  - **Implementation**: call `resolveAccountId`, then `withImapClient` → `client.mailboxOpen(input.folder)` → build a UID sequence set string by joining `input.uids` with commas (e.g. `input.uids.join(",")`) → if `input.read` is `true`, call `client.messageFlagsAdd(uidSet, ["\\Seen"], { uid: true })`, else call `client.messageFlagsRemove(uidSet, ["\\Seen"], { uid: true })`
  - **Return**: `{ ok: true }`
  - Follow the same `resolveAccountId` → `withImapClient` → `mailboxOpen` pattern as the existing `markAsRead` mutation
- [x] In `src/server/api/routers/mail.ts`, add a `batchMoveMessages` mutation to the `mailRouter` with the following specification:
  - **Input schema**: `{ accountId: z.string().cuid().optional(), folder: z.string().min(1), uids: z.array(z.number().int().positive()).min(1), destinationFolder: z.string().min(1) }`
  - **Implementation**: call `resolveAccountId`, then `withImapClient` → `client.mailboxOpen(input.folder)` → build a UID sequence set string by joining `input.uids` with commas → call `client.messageMove(uidSet, input.destinationFolder, { uid: true })`
  - **Return**: `{ ok: true }`
  - Follow the same pattern as the existing `moveMessage` mutation

### Phase 2: Frontend — Smart Selection Dropdown

**Goal:** Wire the existing `ChevronDownIcon` button next to the select-all checkbox to a dropdown menu with smart selection options: All, None, Read, Unread.

#### Tasks

- [x] In `src/components/mail-list.tsx`, import `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` from `~/components/ui/dropdown-menu`
- [x] Replace the bare `<Button variant="ghost" size="icon-xs">` wrapping the `ChevronDownIcon` with a `DropdownMenu` + `DropdownMenuTrigger asChild` + `DropdownMenuContent` structure
- [x] Add four `DropdownMenuItem` entries inside the `DropdownMenuContent`:
  1. **All** — `onClick` calls `setSelected(new Set(messages.map((m) => String(m.uid))))`
  2. **None** — `onClick` calls `setSelected(new Set())`
  3. **Read** — `onClick` calls `setSelected(new Set(messages.filter((m) => m.read).map((m) => String(m.uid))))`
  4. **Unread** — `onClick` calls `setSelected(new Set(messages.filter((m) => !m.read).map((m) => String(m.uid))))`

### Phase 3: Frontend — Contextual Toolbar with Batch Actions

**Goal:** Replace the static toolbar buttons with a selection-aware toolbar. Show Refresh when idle, batch action buttons when messages are selected.

#### Tasks

- [x] In `src/components/mail-list.tsx`, import `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`, `DropdownMenuSeparator` from `~/components/ui/dropdown-menu`
- [x] In `src/components/mail-list.tsx`, import `MailIcon`, `MailOpenIcon`, `AlertOctagonIcon`, `FolderInputIcon` from `lucide-react` (add only those not already imported)
- [x] In `src/components/mail-list.tsx`, add a `useQuery` call for `api.mail.listFolders.useQuery({})` to resolve folder paths — derive `trashFolder` (where `specialUse === "\\Trash"`), `junkFolder` (where `specialUse === "\\Junk"`), and the full folder list from the query result
- [x] In `src/components/mail-list.tsx`, add `api.useUtils()` to get the tRPC utils for cache invalidation
- [x] In `src/components/mail-list.tsx`, add a `batchMarkAsRead` mutation via `api.mail.batchMarkAsRead.useMutation()` with an `onSuccess` callback that invalidates `mail.listMessages`, clears the selection via `setSelected(new Set())`, and invalidates `mail.listFolders` (to update unread counts in the sidebar)
- [x] In `src/components/mail-list.tsx`, add a `batchMoveMessages` mutation via `api.mail.batchMoveMessages.useMutation()` with an `onSuccess` callback that invalidates `mail.listMessages`, clears the selection, and invalidates `mail.listFolders`
- [x] Replace the current static toolbar buttons (`Archive`, `Folder`, `Delete`, `MoreHorizontalIcon`) with a conditional block based on `selected.size > 0`:
  - **When `selected.size === 0`** (no selection): render a single **Refresh** button — icon: `RefreshCwIcon`, label: `"Refresh"`, variant: `"ghost"`, size: `"sm"`, `onClick` calls `void refetch()`
  - **When `selected.size > 0`** (selection active): render the following action buttons in order:
    1. **Delete** — icon: `Trash2Icon`, label: `"Delete"`, variant: `"ghost"`, size: `"sm"`, `onClick` calls `batchMoveMessages.mutate({ folder, uids: selectedUids, destinationFolder: trashFolder })` — guarded by checking `trashFolder` is defined
    2. **Report Spam** — icon: `AlertOctagonIcon`, label: `"Report spam"`, variant: `"ghost"`, size: `"sm"`, `onClick` calls `batchMoveMessages.mutate({ folder, uids: selectedUids, destinationFolder: junkFolder })` — guarded by checking `junkFolder` is defined
    3. **Mark as Read** — icon: `MailOpenIcon`, label: `"Mark as read"`, variant: `"ghost"`, size: `"sm"`, `onClick` calls `batchMarkAsRead.mutate({ folder, uids: selectedUids, read: true })`
    4. **Mark as Unread** — icon: `MailIcon`, label: `"Mark as unread"`, variant: `"ghost"`, size: `"sm"`, `onClick` calls `batchMarkAsRead.mutate({ folder, uids: selectedUids, read: false })`
    5. **Move To** — rendered as a `DropdownMenu` with a trigger button (icon: `FolderInputIcon`, label: `"Move to"`, variant: `"ghost"`, size: `"sm"`) and a `DropdownMenuContent` listing all folders (except the current `folder`) as `DropdownMenuItem` entries — each `onClick` calls `batchMoveMessages.mutate({ folder, uids: selectedUids, destinationFolder: f.path })`
- [x] Derive `selectedUids` as `Array.from(selected).map(Number)` — the selection set stores UIDs as strings; the batch mutations expect numbers

### Phase 4: Toolbar in Empty and Loading States

**Goal:** Ensure the Refresh button is available in the empty state toolbar, and that the checkbox + smart selection dropdown are hidden when there are no messages.

#### Tasks

- [x] In the empty-state branch (where `messages.length === 0`), add a **Refresh** button alongside the Write Message button — icon: `RefreshCwIcon`, variant: `"ghost"`, size: `"sm"`, `onClick` calls `void refetch()`
- [x] Ensure the select-all checkbox and smart selection dropdown are only rendered in the main (non-empty, non-loading, non-error) toolbar — they should not appear in the loading skeleton, error, or empty states

## Acceptance Criteria

- [ ] When no messages are selected, the toolbar shows only the Refresh button and Write Message button — no Archive, Folder, Delete, or More buttons
- [ ] When one or more messages are selected, the toolbar shows: Delete, Report Spam, Mark as Read, Mark as Unread, and Move To — plus Write Message
- [ ] The smart selection dropdown (triggered by the chevron next to the checkbox) offers four options: All, None, Read, Unread
- [ ] Selecting "All" checks all loaded messages; selecting "None" unchecks all; "Read" selects only read messages; "Unread" selects only unread messages
- [ ] Delete moves all selected messages to the Trash folder and clears the selection
- [ ] Report Spam moves all selected messages to the Junk folder and clears the selection
- [ ] Mark as Read adds the `\Seen` flag to all selected messages and refreshes the list
- [ ] Mark as Unread removes the `\Seen` flag from all selected messages and refreshes the list
- [ ] Move To opens a dropdown listing all folders (except the current one) and moves all selected messages to the chosen folder
- [ ] Batch operations use a single IMAP connection with a UID sequence set — not N individual connections
- [ ] The Refresh button calls `refetch()` to reload the current folder's messages
- [ ] No TypeScript errors — `pnpm build` passes cleanly
