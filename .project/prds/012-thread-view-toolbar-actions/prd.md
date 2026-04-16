---
title: "Thread View: Toolbar Actions"
status: draft
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
  - type: prd
    url: .project/prds/010-thread-view-message-actions-dropdown/prd.md
    description: "Prior PRD — Thread view message actions dropdown (moveMessage mutation, listFolders query, per-message actions pattern)"
  - type: prd
    url: .project/prds/011-mail-list-group-actions/prd.md
    description: "Prior PRD — Mail list group actions (batch mutations, contextual toolbar pattern, Move To submenu)"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Thread View: Toolbar Actions

## Description

The thread view toolbar — the horizontal bar below the app header containing a back button, action buttons, and a print icon — currently renders four static placeholder buttons: Archive, Move, Delete, and a three-dots More button. None of these buttons are wired to any functionality. The mutations and folder resolution logic needed to power these actions already exist in the component (added in PRD 010), but they are only connected to the per-message dropdown menu, not the toolbar.

This PRD replaces the static placeholder toolbar buttons with four functional actions: **Report Spam**, **Delete**, **Mark as unread**, and a **More** dropdown containing a **Move To** submenu. The existing **Print** button on the far right is preserved as a static placeholder for future implementation. The non-functional **Archive** and top-level **Move** buttons are removed since they are not part of the target design.

### Design Decisions

- **Archive button removed**: The Archive action has no backend support — there is no IMAP "archive" operation in the codebase, and no archive folder convention. The button is removed from the toolbar entirely. If archive support is added in the future, a new PRD will reintroduce it.
- **Top-level Move button removed; Move To lives inside More dropdown**: The user-facing design places "Move To" inside the three-dots More dropdown rather than as a top-level toolbar button. This keeps the primary action bar focused on the most common destructive/organisational actions (Report Spam, Delete, Mark as unread) and avoids toolbar clutter.
- **"Mark as unread" instead of a toggle**: The toolbar button is always "Mark as unread" (not a read/unread toggle). Since `getMessage` auto-marks messages as `\Seen` on fetch (PRD 010), a user viewing a thread has always-read messages. The per-message dropdown retains the full toggle for edge cases, but the toolbar surfaces only the useful direction. After marking as unread, the user is navigated back to the mail list — this is already handled by the existing `markAsReadMutation.onSuccess` callback when `read` is `false`.
- **Delete means "move to Trash"**: Consistent with PRDs 010 and 011. The message is moved to the user's Trash folder. Permanent deletion is out of scope.
- **Report Spam means "move to Junk"**: Consistent with PRDs 010 and 011. No spam-reporting headers — purely a folder-move operation.
- **Contextual hiding of actions**: Delete is hidden when viewing the Trash folder. Report Spam is hidden when viewing the Trash or Junk folders. This is consistent with the per-message dropdown behaviour established in PRD 010.
- **No new backend work required**: All mutations (`markAsRead`, `moveMessage`) and queries (`listFolders`) are already defined in the component from PRD 010. This PRD is purely a frontend wiring task.
- **Print button preserved as static**: The Print button remains on the far right of the toolbar with no `onClick` handler. Print functionality will be implemented in a future PRD.
- **DropdownMenu primitives already available**: All required `DropdownMenu` subcomponents (`DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`) are already imported in `mail-thread.tsx` from PRD 010. No new UI component installation is needed.
- **Tooltip consideration deferred**: The toolbar buttons use visible text labels (e.g. "Delete", "Report spam"), so tooltips are not required for accessibility. If iconified (label-less) variants are introduced later, tooltips should be added at that time.

### User Stories

- **As a** user viewing a message thread, **I want** to click "Delete" in the toolbar to move the message to Trash, **so that** I can remove unwanted mail without opening the per-message dropdown.
- **As a** user viewing a message thread, **I want** to click "Report spam" in the toolbar to move the message to Junk, **so that** I can quickly flag spam without opening the per-message dropdown.
- **As a** user viewing a message thread, **I want** to click "Mark as unread" in the toolbar to flag the message for later, **so that** it appears unread in my inbox and I'm navigated back to the mail list.
- **As a** user viewing a message thread, **I want** to click the More button and select "Move to" followed by a folder, **so that** I can organise the message into a specific folder directly from the toolbar.
- **As a** user viewing a message in Trash, **I want** the Delete button to be hidden, **so that** I'm not confused by a redundant "move to Trash" action.
- **As a** user viewing a message in Junk, **I want** the Report Spam button to be hidden, **so that** I'm not confused by a redundant "move to Junk" action.

## Implementation Plan

### Phase 1: Replace Static Toolbar Buttons with Functional Actions

**Goal:** Remove the non-functional Archive, Move, Delete, and More placeholder buttons from the `MailThreadView` toolbar and replace them with functional Report Spam, Delete, Mark as unread, and a More dropdown with Move To.

#### Tasks

- [ ] In `src/components/mail-thread.tsx`, in the `MailThreadView` component's toolbar section (the `<div className="flex items-center gap-1">` block after the back button and separator), remove the four existing static buttons: Archive (`ArchiveIcon`), Move (`FolderIcon`), Delete (`Trash2Icon`), and More (`MoreHorizontalIcon`)
- [ ] In the same toolbar location, add a **Report Spam** button:
  - Element: `<Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">`
  - Icon: `AlertOctagonIcon` (already imported)
  - Label: `"Report spam"`
  - `onClick`: calls `moveMessageMutation.mutate({ folder, uid: message.uid, destinationFolder: junkFolder })` — guarded by checking that `junkFolder` is defined and `message` is loaded
  - Conditionally rendered: hidden when `isJunkFolder` or `isTrashFolder` is `true`
- [ ] Add a **Delete** button:
  - Element: `<Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">`
  - Icon: `Trash2Icon` (already imported)
  - Label: `"Delete"`
  - `onClick`: calls `moveMessageMutation.mutate({ folder, uid: message.uid, destinationFolder: trashFolder })` — guarded by checking that `trashFolder` is defined and `message` is loaded
  - Conditionally rendered: hidden when `isTrashFolder` is `true`
- [ ] Add a **Mark as unread** button:
  - Element: `<Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">`
  - Icon: `MailIcon` (already imported)
  - Label: `"Mark as unread"`
  - `onClick`: calls `markAsReadMutation.mutate({ folder, uid: message.uid, read: false })` — the existing `onSuccess` callback already navigates back to the mail list when `read` is `false`
  - Always rendered (not conditionally hidden) — relevant in all folder contexts
- [ ] Add a **More** dropdown menu:
  - Wrap a `<Button variant="ghost" size="icon-sm" className="text-muted-foreground">` containing `<MoreHorizontalIcon>` with `<DropdownMenu modal={false}>` and `<DropdownMenuTrigger asChild>`
  - Inside `<DropdownMenuContent align="end">`, add a **Move To** submenu using the following structure:
    - `<DropdownMenuSub>` → `<DropdownMenuSubTrigger>` with `FolderInputIcon` icon and `"Move to"` label
    - `<DropdownMenuSubContent>` listing all folders from `folders` (excluding the current `folder`) as `<DropdownMenuItem>` entries — each with a `FolderIcon` and the folder name (capitalised first letter), `onClick` calling `moveMessageMutation.mutate({ folder, uid: message.uid, destinationFolder: f.path })`
  - The Move To submenu is conditionally rendered only when `folders` has entries and `message` is loaded
- [ ] Ensure the **Print** button remains in its current position on the far right of the toolbar (`<div className="ml-auto ...">`) — no changes to its markup or behaviour

### Phase 2: Cleanup Unused Imports

**Goal:** Remove any imports that are no longer referenced after the toolbar refactor.

#### Tasks

- [ ] In `src/components/mail-thread.tsx`, check whether `ArchiveIcon` is still used anywhere in the file — if not, remove it from the `lucide-react` import statement
- [ ] Verify that all other imported icons (`Trash2Icon`, `FolderIcon`, `MoreHorizontalIcon`, `PrinterIcon`, `AlertOctagonIcon`, `MailIcon`, `FolderInputIcon`) are still referenced — remove any that are unreferenced

## Acceptance Criteria

- [ ] The thread view toolbar shows (left to right): Back button, separator, Report Spam, Delete, Mark as unread, More (`...`), then Print on the far right
- [ ] Clicking "Report spam" moves the message to the Junk folder and navigates back to the mail list
- [ ] Clicking "Delete" moves the message to the Trash folder and navigates back to the mail list
- [ ] Clicking "Mark as unread" removes the `\Seen` flag from the message and navigates back to the mail list
- [ ] Clicking More → Move to → [folder] moves the message to the selected folder and navigates back to the mail list
- [ ] "Report spam" is not shown when viewing a message in the Junk or Trash folder
- [ ] "Delete" is not shown when viewing a message in the Trash folder
- [ ] The Print button is visible on the far right but has no click handler (static placeholder)
- [ ] The Archive and top-level Move buttons are no longer present in the toolbar
- [ ] No TypeScript errors — `pnpm build` passes cleanly
