---
title: "Mail List: Context Menu Actions"
status: completed
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
  - type: prd
    url: .project/prds/011-mail-list-group-actions/prd.md
    description: "Prior PRD — Mail list group actions (batch mutations, contextual toolbar, selection state)"
  - type: prd
    url: .project/prds/012-thread-view-toolbar-actions/prd.md
    description: "Prior PRD — Thread view toolbar actions (per-message actions pattern, Move To submenu)"
  - type: prd
    url: .project/prds/010-thread-view-message-actions-dropdown/prd.md
    description: "Prior PRD — Thread view message actions dropdown (moveMessage mutation, listFolders query)"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Mail List: Context Menu Actions

## Description

The mail list currently supports bulk operations only through the toolbar — users must first select messages via checkboxes, then click toolbar buttons. There is no right-click or long-press context menu on individual mail list items. This is a common interaction pattern in desktop and mobile mail clients (Gmail, Outlook, Apple Mail) that allows users to quickly act on one or more messages without navigating away from the list view.

This PRD adds a context menu (right-click / long-press) to each mail list row. The menu provides six actions: **Reply**, **Reply All**, **Forward**, **Delete**, **Mark as read / Mark as unread**, and **Move to**. The context menu integrates with the existing checkbox-based selection state through a set of smart selection rules that determine which messages the action applies to.

Reply, Reply All, and Forward are rendered as static (disabled) menu items — their underlying compose functionality is a future feature. Delete, Mark as read/unread, and Move to are fully functional, reusing the existing `batchMarkAsRead` and `batchMoveMessages` mutations from PRD 011.

### Design Decisions

- **shadcn `context-menu` component**: The context menu is built using the shadcn/ui `context-menu` component (Radix UI `@radix-ui/react-context-menu`). This provides native right-click triggering on desktop and long-press on mobile out of the box. The component is installed via the shadcn CLI and follows the same pattern as the existing `dropdown-menu` component.
- **Context menu shares selection state with toolbar**: The context menu operates on the same `selected` Set state as the toolbar. This means actions triggered from the context menu (Delete, Mark as read/unread, Move to) affect all currently selected messages — identical to clicking the corresponding toolbar button. No separate "context menu selection" state is introduced.
- **Smart selection on context menu open**: When a context menu is triggered on a mail list item, the selection state is updated according to these rules:
  1. **No items currently selected** → The right-clicked item becomes the sole selection.
  2. **Items are selected, but the right-clicked item is NOT in the selection** → All current selections are cleared; the right-clicked item becomes the sole selection.
  3. **Items are selected, and the right-clicked item IS in the selection** → The existing selection is preserved unchanged; the context menu opens at the click position and actions apply to the entire selection.
- **Selection persists after context menu close**: When the context menu is dismissed without choosing an action (clicking away, pressing Escape), the selection state is not reverted. Items that were selected by the context-menu-open logic remain selected.
- **Reply / Reply All / Forward are disabled placeholders**: These three actions are rendered in the context menu but are visually disabled (`disabled` prop on `ContextMenuItem`). Their compose integration (pre-filling recipients, subject, body) is a future feature that requires extending the `MailComposer` component. Including them now establishes the correct menu structure and sets user expectations.
- **Mark as read vs. Mark as unread — dynamic label**: The context menu shows either "Mark as read" or "Mark as unread" based on the read state of the selected messages. For a single selected item, the label matches its state. For multiple selected items: if any are unread, the label is "Mark as read" (prioritising marking as read); if all are read, the label is "Mark as unread".
- **Move to uses `ContextMenuSub`**: The "Move to" action opens an inline sub-menu listing all IMAP folders (except the current folder), following the same pattern as the toolbar's Move To dropdown (PRD 011) and the thread view's More → Move to (PRD 012). Each folder item calls `batchMoveMessages.mutate()`.
- **Delete means "move to Trash"**: Consistent with PRDs 010, 011, and 012. The message(s) are moved to the Trash folder via `batchMoveMessages`.
- **`ContextMenuTrigger asChild` wraps the existing `<Link>`**: The `ContextMenuTrigger` uses `asChild` to forward its props to the existing `<Link>` element. This preserves left-click navigation to the thread view (`/dashboard/mail/[uid]`) while right-click opens the context menu. No change to the existing click-to-navigate behaviour.
- **No new backend work required**: All mutations (`batchMarkAsRead`, `batchMoveMessages`) and queries (`listFolders`) already exist from PRDs 010 and 011. This PRD is purely a frontend feature.
- **Selection cleared after successful action**: Consistent with the toolbar behaviour (PRD 011), the selection set is cleared after any successful batch mutation triggered from the context menu.

### User Stories

- **As a** user viewing my inbox, **I want** to right-click a message and see a context menu with common actions, **so that** I can quickly act on a message without using the toolbar or opening the thread.
- **As a** user viewing my inbox, **I want** the right-clicked message to become selected automatically, **so that** I know which message the context menu actions will affect.
- **As a** user with multiple messages selected, **I want** to right-click one of the selected messages and have the context menu actions apply to all of them, **so that** I can perform bulk operations via right-click.
- **As a** user with multiple messages selected, **I want** right-clicking an unselected message to deselect all and select only the new item, **so that** the context menu behaviour is predictable and I can quickly switch focus.
- **As a** user viewing my inbox, **I want** to right-click a message and delete it, **so that** I can remove it without selecting the checkbox first.
- **As a** user viewing my inbox, **I want** to right-click a message and mark it as read or unread, **so that** I can manage read state without opening the message.
- **As a** user viewing my inbox, **I want** to right-click a message and move it to a specific folder via a sub-menu, **so that** I can organise mail directly from the list.
- **As a** mobile user viewing my inbox, **I want** to long-press a message and see the same context menu, **so that** I have feature parity with desktop right-click.

## Implementation Plan

### Phase 1: Install shadcn Context Menu Component

**Goal:** Add the shadcn/ui `context-menu` component to the project, providing all required Radix primitives for building the right-click menu.

#### Tasks

- [x] Run `pnpm dlx shadcn@latest add context-menu` to install the component — this creates `src/components/ui/context-menu.tsx` with exports for `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`, `ContextMenuSub`, `ContextMenuSubTrigger`, `ContextMenuSubContent`, and related primitives

### Phase 2: Context Menu Selection Logic

**Goal:** Add the smart selection behaviour that fires when a context menu is opened on a mail list item, ensuring the correct items are selected before the menu is shown.

#### Tasks

- [x] In `src/components/mail-list.tsx`, add a `handleContextMenu` callback function that accepts a `mailId: string` parameter and implements the three selection rules:
  1. If `selected.size === 0`, call `setSelected(new Set([mailId]))` — select only the right-clicked item
  2. If `selected.size > 0` and `!selected.has(mailId)`, call `setSelected(new Set([mailId]))` — clear existing selection, select only the right-clicked item
  3. If `selected.size > 0` and `selected.has(mailId)`, do nothing — keep existing selection unchanged
- [x] Wrap `handleContextMenu` in `useCallback` with `[selected]` in the dependency array to avoid unnecessary re-renders

### Phase 3: Context Menu UI Integration

**Goal:** Wrap each mail list row with the `ContextMenu` component and build the context menu content with all six action items.

#### Tasks

- [x] In `src/components/mail-list.tsx`, add imports for `ContextMenu`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`, `ContextMenuSub`, `ContextMenuSubContent`, `ContextMenuSubTrigger`, `ContextMenuTrigger` from `~/components/ui/context-menu`
- [x] In `src/components/mail-list.tsx`, add imports for `ReplyIcon`, `ReplyAllIcon`, `ForwardIcon` from `lucide-react`
- [x] In the messages `.map()` rendering block, wrap each mail list row's `<Link>` element with `<ContextMenu>` and `<ContextMenuTrigger asChild>`. Attach the `onContextMenu` event to the `<Link>` element (or a wrapping div) to call `handleContextMenu(mailId)` before the Radix context menu opens
- [x] After the `<ContextMenuTrigger>`, add a `<ContextMenuContent>` block containing the following items in order:
  1. **Reply** — `<ContextMenuItem disabled>` with `ReplyIcon` and label `"Reply"`
  2. **Reply All** — `<ContextMenuItem disabled>` with `ReplyAllIcon` and label `"Reply all"`
  3. **Forward** — `<ContextMenuItem disabled>` with `ForwardIcon` and label `"Forward"`
  4. `<ContextMenuSeparator />`
  5. **Delete** — `<ContextMenuItem>` with `Trash2Icon` and label `"Delete"`, `onClick` calls `batchMoveMessages.mutate({ folder, uids: Array.from(selected).map(Number), destinationFolder: trashFolder })` — conditionally rendered only when `trashFolder` is defined
  6. **Mark as read / Mark as unread** — `<ContextMenuItem>` with dynamic icon and label:
     - Determine the label by checking selected messages: look up each selected UID in the `messages` array; if any selected message has `read === false`, show `"Mark as read"` with `MailOpenIcon` and call `batchMarkAsRead.mutate({ ..., read: true })`; if all selected messages have `read === true`, show `"Mark as unread"` with `MailIcon` and call `batchMarkAsRead.mutate({ ..., read: false })`
  7. `<ContextMenuSeparator />`
  8. **Move to** — `<ContextMenuSub>` with `<ContextMenuSubTrigger>` containing `FolderInputIcon` and label `"Move to"`, and `<ContextMenuSubContent>` listing all folders from the `folders` query (excluding the current `folder`) as `<ContextMenuItem>` entries — each with the folder name (display "Inbox" for `"INBOX"`, otherwise the folder's `name` property) and an `onClick` calling `batchMoveMessages.mutate({ folder, uids: Array.from(selected).map(Number), destinationFolder: f.path })`

### Phase 4: Selection Derivation for Dynamic Menu Labels

**Goal:** Ensure the context menu correctly derives the read/unread state of selected messages to determine the dynamic label for the Mark as read/unread action.

#### Tasks

- [x] In `src/components/mail-list.tsx`, add a derived boolean `hasUnreadSelected` computed as: `messages.some((m) => selected.has(String(m.uid)) && !m.read)` — this is `true` when any selected message is unread
- [x] Use `hasUnreadSelected` to conditionally render:
  - When `true`: show "Mark as read" with `MailOpenIcon`, `onClick` calls `batchMarkAsRead.mutate({ folder, uids: Array.from(selected).map(Number), read: true })`
  - When `false`: show "Mark as unread" with `MailIcon`, `onClick` calls `batchMarkAsRead.mutate({ folder, uids: Array.from(selected).map(Number), read: false })`

## Acceptance Criteria

- [x] Right-clicking a mail list item when no items are selected causes the item to become selected (checkbox checked) and opens a context menu at the click position
- [x] Right-clicking a mail list item that is not in the current selection clears all selections, selects only the right-clicked item, and opens the context menu
- [x] Right-clicking a mail list item that is already in a multi-selection preserves the entire selection and opens the context menu
- [x] The context menu displays six items: Reply, Reply all, Forward, Delete, Mark as read/unread, Move to
- [x] Reply, Reply all, and Forward are visible but disabled (greyed out, not clickable)
- [x] Clicking "Delete" in the context menu moves all selected messages to the Trash folder, clears the selection, and refreshes the list
- [x] Clicking "Mark as read" in the context menu adds the `\Seen` flag to all selected messages, clears the selection, and refreshes the list
- [x] Clicking "Mark as unread" in the context menu removes the `\Seen` flag from all selected messages, clears the selection, and refreshes the list
- [x] The Mark as read/unread label is dynamic: shows "Mark as read" when any selected message is unread; shows "Mark as unread" when all selected messages are read
- [x] Clicking "Move to" opens a sub-menu listing all IMAP folders except the current one; clicking a folder moves all selected messages there, clears the selection, and refreshes the list
- [x] Left-clicking a mail list item still navigates to `/dashboard/mail/[uid]` — context menu does not interfere with normal navigation
- [x] Long-press on mobile triggers the same context menu (native Radix context menu behaviour)
- [x] Dismissing the context menu without selecting an action does not revert the selection state
- [x] No TypeScript errors — `pnpm build` passes cleanly
