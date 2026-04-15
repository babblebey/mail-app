---
title: "Thread View: Message Actions Dropdown Menu"
status: pending
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
  - type: prd
    url: .project/prds/003-imap-fetch-folders-and-messages/prd.md
    description: "Prior PRD — IMAP fetch folders & messages (markAsRead, toggleStar mutations)"
  - type: prd
    url: .project/prds/008-thread-view-sender-display-email-details/prd.md
    description: "Prior PRD — Thread view sender display & email details popover (message header layout)"
  - type: prd
    url: .project/prds/009-attachment-downloads-preview/prd.md
    description: "Prior PRD — Attachment downloads & preview (thread view component structure)"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Thread View: Message Actions Dropdown Menu

## Description

The thread view currently renders a three-dots (`MoreHorizontalIcon`) button on each message's sender/recipient row — next to the Reply button — but it is not wired to any dropdown or action. Users have no way to perform per-message actions such as marking as unread, deleting, or reporting spam from within the thread view.

This PRD adds a `DropdownMenu` to that button with five actions: Reply (static), Forward (static), Mark as Read/Unread, Delete (move to Trash), and Report Spam (move to Junk). "Reply" and "Forward" are visually present but non-functional since SMTP sending is not yet implemented. The remaining three actions are fully functional and interact with the IMAP server.

### Design Decisions

- **Reply and Forward are static (disabled)**: SMTP sending is not yet implemented in the app. These items are included for visual completeness (matching Gmail's pattern shown in the reference screenshot) and will be wired up when SMTP support is added. They trigger the existing inline composer action instead of being fully disabled — Reply opens the reply composer, Forward opens the forward composer.
- **Delete means "move to Trash"**: Clicking Delete moves the message to the user's Trash folder via the IMAP `messageMove` command. This is non-destructive — the message can be recovered from Trash. Permanent deletion from within Trash is out of scope for this PRD.
- **Report Spam means "move to Junk"**: Clicking Report Spam moves the message to the Junk folder. This mirrors Gmail's "Report spam" behavior. No spam-reporting headers or feedback loops are sent — it is purely a folder-move operation.
- **Dynamic Trash/Junk folder path resolution**: IMAP providers use different folder paths for Trash and Junk (e.g. `"Trash"` vs `"[Gmail]/Trash"`, `"Junk"` vs `"[Gmail]/Spam"`). The component queries `listFolders` and resolves the correct paths by matching `specialUse === "\\Trash"` and `specialUse === "\\Junk"`.
- **Navigate back after move**: After a successful Delete or Report Spam, the user is redirected back to the mail list for the current folder, since the message is no longer in that folder. Both `getMessage` and `listMessages` queries are invalidated to ensure fresh data.
- **Hide contextually irrelevant actions**: Delete is hidden when already viewing the Trash folder. Report Spam is hidden when viewing the Junk or Trash folders. This avoids confusing "move to the folder you're already in" scenarios.
- **New `moveMessage` tRPC mutation**: A new backend mutation is added to handle folder-to-folder message movement. It uses ImapFlow's `messageMove` method, following the same `withImapClient` / `resolveAccountId` pattern established by `markAsRead` and `toggleStar`.
- **Mark as Read/Unread toggles dynamically**: The menu item label reads "Mark as unread" when the message is already read, and "Mark as read" when unread. Since `getMessage` auto-marks messages as `\Seen`, the typical use case is marking a message back to unread after viewing it.
- **DropdownMenu component already available**: The `DropdownMenu` primitives from `~/components/ui/dropdown-menu` are already imported and used in `mail-thread.tsx` (for the "Send Later" dropdown in the inline composer). No new UI component installation is needed.
- **`DropdownMenuSeparator` for visual grouping**: Menu items are grouped with separators: communication actions (Reply, Forward), then status actions (Mark as Read/Unread), then destructive/move actions (Delete, Report Spam). This matches Gmail's grouping pattern.
- **Destructive variant for Delete**: The Delete menu item uses `variant="destructive"` styling from the `DropdownMenuItem` component to signal its destructive nature.

### User Stories

- **As a** user viewing a message thread, **I want** to click the three-dots button on a message and see a dropdown with common actions, **so that** I can quickly act on a message without leaving the thread view.
- **As a** user viewing a message I've already read, **I want** to mark it as unread from the dropdown, **so that** I can flag it for follow-up in my inbox.
- **As a** user viewing an unwanted message, **I want** to delete it from the dropdown, **so that** it moves to my Trash folder and is removed from my current view.
- **As a** user viewing a spam message, **I want** to report it as spam from the dropdown, **so that** it moves to my Junk folder and is removed from my current view.
- **As a** user viewing a message in my Trash folder, **I want** the Delete option to be hidden, **so that** I'm not confused by a redundant action.
- **As a** user viewing a message in my Junk folder, **I want** the Report Spam option to be hidden, **so that** I'm not confused by a redundant action.

## Implementation Plan

### Phase 1: Backend — Add `moveMessage` tRPC Mutation

**Goal:** Expose a new mutation that moves a message from one IMAP folder to another using ImapFlow's `messageMove` method.

#### Tasks

- [ ] In `src/server/api/routers/mail.ts`, add a `moveMessage` mutation to the `mailRouter` with the following specification:
  - **Input schema**: `{ accountId: z.string().cuid().optional(), folder: z.string().min(1), uid: z.number().int().positive(), destinationFolder: z.string().min(1) }`
  - **Implementation**: call `resolveAccountId`, then `withImapClient` → `client.mailboxOpen(input.folder)` → `client.messageMove(String(input.uid), input.destinationFolder, { uid: true })`
  - **Return**: `{ ok: true }`
  - Follow the same pattern as the existing `markAsRead` mutation (lines 378–418 of `mail.ts`)

### Phase 2: Frontend — Wire Dropdown to Three-Dots Button

**Goal:** Replace the bare `<Button>` with a fully interactive `DropdownMenu` containing all five action items.

#### Tasks

- [ ] In `src/components/mail-thread.tsx`, import `DropdownMenuSeparator` from `~/components/ui/dropdown-menu` (the other DropdownMenu primitives are already imported)
- [ ] In `src/components/mail-thread.tsx`, import `useRouter` from `next/navigation` in the `MailThreadView` component for post-action navigation
- [ ] In `src/components/mail-thread.tsx`, import `MailIcon`, `MailOpenIcon`, `Trash2Icon`, `AlertOctagonIcon` from `lucide-react` for the dropdown menu item icons (add only those not already imported; `Trash2Icon` is already imported)
- [ ] In the `MailThreadView` component, add a `useQuery` call for `api.mail.listFolders.useQuery({})` to resolve dynamic Trash and Junk folder paths — derive `trashFolder` (folder where `specialUse === "\\Trash"`) and `junkFolder` (folder where `specialUse === "\\Junk"`) from the query result, falling back to `undefined` if not found
- [ ] In the `MailThreadView` component, add a `markAsRead` mutation via `api.mail.markAsRead.useMutation()` with an `onSuccess` callback that invalidates the `getMessage` query and the `listMessages` query
- [ ] In the `MailThreadView` component, add a `moveMessage` mutation via `api.mail.moveMessage.useMutation()` with an `onSuccess` callback that invalidates the `getMessage` and `listMessages` queries and navigates the user back to the mail list via `router.push(backHref)`
- [ ] Pass the following new props from `MailThreadView` to the `MessageItem` component: `onMarkAsRead` (callback), `onDelete` (callback), `onReportSpam` (callback), `isTrashFolder` (boolean), `isJunkFolder` (boolean), plus any loading states needed for disabling items during mutation

### Phase 3: Dropdown Menu in MessageItem

**Goal:** Build the dropdown menu inside the `MessageItem` component, wired to the action callbacks passed from the parent.

#### Tasks

- [ ] In the `MessageItem` component within `src/components/mail-thread.tsx`, wrap the existing three-dots `<Button>` (the `MoreHorizontalIcon` button next to the Reply button, around line 275) with `<DropdownMenu modal={false}>`, `<DropdownMenuTrigger asChild>`, and `<DropdownMenuContent align="end">`
- [ ] Add the following `DropdownMenuItem` entries inside `DropdownMenuContent`:
  1. **Reply** — icon: `ReplyIcon`, label: `"Reply"`, `onClick` triggers `onReply` prop (opens the existing inline reply composer)
  2. **Forward** — icon: `ForwardIcon`, label: `"Forward"`, `onClick` triggers `onForward` prop (opens the existing inline forward composer)
  3. `<DropdownMenuSeparator />`
  4. **Mark as Read/Unread** — icon: `MailIcon` when unread / `MailOpenIcon` when read, label: `"Mark as read"` when unread / `"Mark as unread"` when read, `onClick` calls `onMarkAsRead` callback
  5. `<DropdownMenuSeparator />`
  6. **Delete** — icon: `Trash2Icon`, label: `"Delete"`, `variant="destructive"`, `onClick` calls `onDelete` callback — **conditionally rendered**: hidden when `isTrashFolder` is `true`
  7. **Report Spam** — icon: `AlertOctagonIcon`, label: `"Report spam"`, `onClick` calls `onReportSpam` callback — **conditionally rendered**: hidden when `isJunkFolder` or `isTrashFolder` is `true`

### Phase 4: Wire MessageItem Props

**Goal:** Connect the `MessageItem` dropdown actions to the mutations defined in `MailThreadView`.

#### Tasks

- [ ] Update the `MessageItem` component's props interface to accept: `onMarkAsRead: () => void`, `onDelete: () => void`, `onReportSpam: () => void`, `isTrashFolder: boolean`, `isJunkFolder: boolean`
- [ ] In `MailThreadView`, define the `onMarkAsRead` handler that calls `markAsRead.mutate({ folder, uid: message.uid, read: !message.read })` — this toggles the current read state
- [ ] In `MailThreadView`, define the `onDelete` handler that calls `moveMessage.mutate({ folder, uid: message.uid, destinationFolder: trashFolder })` — guarded by checking that `trashFolder` is defined
- [ ] In `MailThreadView`, define the `onReportSpam` handler that calls `moveMessage.mutate({ folder, uid: message.uid, destinationFolder: junkFolder })` — guarded by checking that `junkFolder` is defined
- [ ] Pass `isTrashFolder` as `folder.toLowerCase().includes("trash")` and `isJunkFolder` as `folder.toLowerCase().includes("junk") || folder.toLowerCase().includes("spam")` — consistent with the folder detection heuristics used in `mail-list.tsx` (PRDs 006/007)

## Acceptance Criteria

- [ ] Clicking the three-dots button on a message's sender/recipient row opens a dropdown menu with: Reply, Forward, separator, Mark as Read/Unread, separator, Delete, Report Spam
- [ ] Reply opens the inline reply composer (same as the existing Reply button)
- [ ] Forward opens the inline forward composer
- [ ] Mark as Read/Unread toggles the message's `\Seen` flag on the IMAP server and the label updates accordingly on re-fetch
- [ ] Delete moves the message to the Trash folder and redirects the user back to the mail list
- [ ] Report Spam moves the message to the Junk folder and redirects the user back to the mail list
- [ ] Delete is not shown when viewing a message in the Trash folder
- [ ] Report Spam is not shown when viewing a message in the Trash or Junk folders
- [ ] The dropdown menu is keyboard-accessible (arrow keys, Enter, Escape)
- [ ] No TypeScript errors — `pnpm build` passes cleanly
