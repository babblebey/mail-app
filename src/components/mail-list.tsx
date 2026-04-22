"use client"

import { useState, useCallback, useRef, useEffect, useMemo, memo } from "react"
import Link from "next/link"
import {
  AlertOctagonIcon,
  Trash2Icon,
  PenSquareIcon,
  ChevronDownIcon,
  StarIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  InboxIcon,
  Loader2Icon,
  PaperclipIcon,
  MailIcon,
  MailOpenIcon,
  FolderInputIcon,
  FolderIcon,
  ReplyIcon,
  ReplyAllIcon,
  ForwardIcon,
} from "lucide-react"

import { cn } from "~/lib/utils"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "~/components/ui/context-menu"
import { Skeleton } from "~/components/ui/skeleton"
import { MailComposer } from "~/components/mail-composer"
import {
  PerformanceProfiler,
  startInteractionTrace,
} from "~/components/performance-profiler"
import { api } from "~/trpc/react"

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function formatDate(isoDate: string) {
  const date = new Date(isoDate)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

function isSentFolder(folder: string): boolean {
  return folder.toLowerCase().includes("sent")
}

function getRecipientName(contact: { name: string; address: string }): string {
  if (contact.name.trim()) {
    return contact.name.trim().split(/\s+/)[0]!
  }
  return contact.address.split("@")[0] ?? contact.address
}

function getSenderName(contact: { name: string; address: string }): string {
  if (contact.name.trim()) {
    return contact.name.trim()
  }
  return contact.address.split("@")[0] ?? contact.address
}

function getRecipientLabel(
  to: { name: string; address: string }[],
  cc: { name: string; address: string }[],
  bcc: { name: string; address: string }[],
): string {
  return `To: ${[...to, ...cc, ...bcc].map(getRecipientName).join(", ")}`
}

function isDraftsFolder(folder: string): boolean {
  return folder.toLowerCase().includes("draft")
}

function isTrashFolder(folder: string): boolean {
  const lower = folder.toLowerCase()
  return lower.includes("trash") || lower.includes("deleted")
}

function isJunkFolder(folder: string): boolean {
  const lower = folder.toLowerCase()
  return lower.includes("junk") || lower.includes("spam")
}

function isRealRecipient(contact: { name: string; address: string }): boolean {
  const addr = contact.address.toLowerCase()
  return !addr.startsWith("undisclosed-recipients")
}

function getDraftRecipientLabel(
  to: { name: string; address: string }[],
  cc: { name: string; address: string }[],
  bcc: { name: string; address: string }[],
): string | null {
  const allRecipients = [...to, ...cc, ...bcc].filter(isRealRecipient)
  if (allRecipients.length === 0) {
    return null
  }
  return allRecipients.map(getRecipientName).join(", ")
}

function classifyMixedFolderEmail(
  mail: {
    flags: string[]
    from: { name: string; address: string }
    to: { name: string; address: string }[]
    cc: { name: string; address: string }[]
    bcc: { name: string; address: string }[]
  },
  userEmails: string[],
): "inbox" | "sent" | "drafts" {
  if (mail.flags.includes("\\Draft")) {
    return "drafts"
  }
  const fromLower = mail.from.address.toLowerCase()
  if (userEmails.includes(fromLower)) {
    const hasRealRecipients =
      [...mail.to, ...mail.cc, ...mail.bcc].filter(isRealRecipient).length > 0
    if (!hasRealRecipients) {
      return "drafts"
    }
    return "sent"
  }
  return "inbox"
}

// ---------------------------------------------------------------------------
// MailRow – memoized single message row with a stable prop interface.
// Isolating per-row rendering prevents unaffected rows from re-rendering
// when the selected Set changes for a single item.
// ---------------------------------------------------------------------------

type MailEntry = {
  uid: number
  subject: string
  date: string
  snippet?: string | null
  from: { name: string; address: string }
  to: { name: string; address: string }[]
  cc: { name: string; address: string }[]
  bcc: { name: string; address: string }[]
  flags: string[]
  read: boolean
  starred: boolean
  hasAttachments: boolean
}

interface MailRowProps {
  mail: MailEntry
  folder: string
  isSelected: boolean
  // Stable getter backed by a ref — never changes identity, so unaffected rows
  // skip re-rendering when the unread-selection state changes.
  getHasUnreadSelected: () => boolean
  userEmails: string[]
  trashFolder: string | undefined
  folderOptions: Array<{ path: string; name: string }>
  onToggleSelect: (id: string) => void
  onContextMenu: (id: string) => void
  onMarkAsRead: (read: boolean) => void
  onMoveMessages: (destinationFolder: string) => void
}

// ---------------------------------------------------------------------------
// MailRowContent — the heavy inner body of each row: unread dot, folder icon,
// avatar, and text content.  None of these depend on `isSelected`, so this
// component always bails out via React.memo when the parent MailRow re-renders
// purely because isSelected changed (e.g. during select-all which would
// otherwise cause O(n) expensive re-renders of the full row tree).
// ---------------------------------------------------------------------------

interface MailRowContentProps {
  mail: MailEntry
  folder: string
  displayMode: "inbox" | "sent" | "drafts"
  realRecipients: { name: string; address: string }[]
  allRecipients: { name: string; address: string }[]
}

const MailRowContent = memo(function MailRowContent({
  mail,
  folder,
  displayMode,
  realRecipients,
  allRecipients,
}: MailRowContentProps) {
  return (
    <>
      {/* Unread indicator */}
      <div className="flex w-2 shrink-0 justify-center">
        {!mail.read && (
          <span className="size-2 rounded-full bg-primary" />
        )}
      </div>

      {/* Trash indicator */}
      {isTrashFolder(folder) && (
        <Trash2Icon className="size-4 shrink-0 text-muted-foreground" />
      )}

      {/* Junk indicator */}
      {isJunkFolder(folder) && (
        <AlertOctagonIcon className="size-4 shrink-0 text-muted-foreground" />
      )}

      {/* Avatar */}
      {displayMode === "drafts" ? (
        realRecipients.length > 0 ? (
          <AvatarGroup className="shrink-0">
            {realRecipients.slice(0, 2).map((contact, i) => (
              <Avatar key={i} size="default">
                <AvatarFallback className="text-sm font-semibold">
                  {getInitials(getRecipientName(contact))}
                </AvatarFallback>
              </Avatar>
            ))}
            {realRecipients.length > 2 && (
              <AvatarGroupCount className="text-sm">
                +{realRecipients.length - 2}
              </AvatarGroupCount>
            )}
          </AvatarGroup>
        ) : (
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="text-sm font-semibold">
              <PenSquareIcon className="size-4" />
            </AvatarFallback>
          </Avatar>
        )
      ) : displayMode === "sent" && allRecipients.length > 0 ? (
        <AvatarGroup className="shrink-0">
          {allRecipients.slice(0, 2).map((contact, i) => (
            <Avatar key={i} size="default">
              <AvatarFallback className="text-sm font-semibold">
                {getInitials(getRecipientName(contact))}
              </AvatarFallback>
            </Avatar>
          ))}
          {allRecipients.length > 2 && (
            <AvatarGroupCount className="text-sm">
              +{allRecipients.length - 2}
            </AvatarGroupCount>
          )}
        </AvatarGroup>
      ) : (
        <Avatar className="size-9 shrink-0">
          <AvatarFallback className="text-sm font-semibold">
            {getInitials(getSenderName(mail.from))}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-6">
        <div className="flex min-w-0 items-center justify-between gap-2 md:w-44 md:shrink-0">
          <div className="flex min-w-0 items-center gap-2">
            {displayMode === "drafts" ? (
              <span className={cn(
                "flex min-w-0 items-baseline gap-0 text-sm",
                !mail.read ? "font-semibold" : "",
              )}>
                <span className="truncate text-foreground">
                  {getDraftRecipientLabel(mail.to, mail.cc, mail.bcc) ?? "No recipient"}
                </span>
                <span className="shrink-0">
                  ,{" "}
                  <span className="text-destructive">Draft</span>
                </span>
              </span>
            ) : (
              <span
                className={cn(
                  "truncate text-sm",
                  !mail.read ? "font-semibold text-foreground" : "text-foreground",
                )}
              >
                {displayMode === "sent" && allRecipients.length > 0
                  ? getRecipientLabel(mail.to, mail.cc, mail.bcc)
                  : getSenderName(mail.from)}
              </span>
            )}
            {mail.starred && (
              <StarIcon className="size-3.5 shrink-0 fill-yellow-400 text-yellow-400" />
            )}
          </div>
          {/* Date on mobile */}
          <span className="shrink-0 text-xs text-muted-foreground md:hidden">
            {formatDate(mail.date)}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span
            className={cn(
              "shrink-0 truncate text-sm",
              !mail.snippet?.trim() ? "" : "max-w-[50%]",
              !mail.read ? "font-semibold text-foreground" : "text-foreground",
            )}
          >
            {mail.subject}
          </span>
          {mail.snippet?.trim() && !(
            displayMode === "drafts" && !mail.snippet?.trim()
          ) && (
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              - {mail.snippet}
            </span>
          )}
        </div>

        {/* Attachments */}
        <span className="size-5 shrink-0 flex items-center">
          {mail.hasAttachments && (
            <PaperclipIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
        </span>

        {/* Date on desktop */}
        <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
          {formatDate(mail.date)}
        </span>
      </div>
    </>
  )
})

// ---------------------------------------------------------------------------
// MailRowMenu — the ContextMenuContent for each row.
// All props are stable (ref-backed getter, stable memoized arrays, stable
// useCallback handlers), so React.memo bails out on every selection change.
// ---------------------------------------------------------------------------

interface MailRowMenuProps {
  trashFolder: string | undefined
  folderOptions: Array<{ path: string; name: string }>
  getHasUnreadSelected: () => boolean
  onMarkAsRead: (read: boolean) => void
  onMoveMessages: (destinationFolder: string) => void
}

const MailRowMenu = memo(function MailRowMenu({
  trashFolder,
  folderOptions,
  getHasUnreadSelected,
  onMarkAsRead,
  onMoveMessages,
}: MailRowMenuProps) {
  return (
    <ContextMenuContent>
      <ContextMenuItem>
        <ReplyIcon className="size-4" />
        Reply
      </ContextMenuItem>
      <ContextMenuItem>
        <ReplyAllIcon className="size-4" />
        Reply all
      </ContextMenuItem>
      <ContextMenuItem>
        <ForwardIcon className="size-4" />
        Forward
      </ContextMenuItem>
      <ContextMenuSeparator />
      {trashFolder && (
        <ContextMenuItem onClick={() => onMoveMessages(trashFolder)}>
          <Trash2Icon className="size-4" />
          Delete
        </ContextMenuItem>
      )}
      {getHasUnreadSelected() ? (
        <ContextMenuItem onClick={() => onMarkAsRead(true)}>
          <MailOpenIcon className="size-4" />
          Mark as read
        </ContextMenuItem>
      ) : (
        <ContextMenuItem onClick={() => onMarkAsRead(false)}>
          <MailIcon className="size-4" />
          Mark as unread
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <FolderInputIcon className="size-4" />
          Move to
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {folderOptions.map((f) => (
            <ContextMenuItem key={f.path} onClick={() => onMoveMessages(f.path)}>
              <FolderIcon className="size-4" />
              {f.name === "INBOX" ? "Inbox" : f.name}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
    </ContextMenuContent>
  )
})

const MailRow = memo(function MailRow({
  mail,
  folder,
  isSelected,
  getHasUnreadSelected,
  userEmails,
  trashFolder,
  folderOptions,
  onToggleSelect,
  onContextMenu,
  onMarkAsRead,
  onMoveMessages,
}: MailRowProps) {
  const mailId = String(mail.uid)

  const displayMode = useMemo<"inbox" | "sent" | "drafts">(() => {
    if (isTrashFolder(folder) || isJunkFolder(folder)) {
      return classifyMixedFolderEmail(mail, userEmails)
    }
    if (isDraftsFolder(folder)) return "drafts"
    if (isSentFolder(folder)) return "sent"
    return "inbox"
  }, [folder, mail, userEmails])

  const realRecipients = useMemo(
    () => [...mail.to, ...mail.cc, ...mail.bcc].filter(isRealRecipient),
    [mail],
  )

  const allRecipients = useMemo(
    () => [...mail.to, ...mail.cc, ...mail.bcc],
    [mail],
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Link
          href={`/dashboard/mail/${mail.uid}?folder=${encodeURIComponent(folder)}`}
          className={cn(
            "group flex items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/50",
            isSelected && "bg-muted/50",
          )}
          onContextMenu={() => onContextMenu(mailId)}
        >
          <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(mailId)}
              aria-label={
                displayMode === "drafts"
                  ? realRecipients.length > 0
                    ? `Select draft to ${realRecipients.map(getRecipientName).join(", ")}`
                    : "Select draft with no recipient"
                  : displayMode === "sent" && allRecipients.length > 0
                    ? `Select mail to ${getRecipientLabel(mail.to, mail.cc, mail.bcc)}`
                    : `Select mail from ${getSenderName(mail.from)}`
              }
              className="shrink-0"
            />
          </div>
          <MailRowContent
            mail={mail}
            folder={folder}
            displayMode={displayMode}
            realRecipients={realRecipients}
            allRecipients={allRecipients}
          />
        </Link>
      </ContextMenuTrigger>
      <MailRowMenu
        trashFolder={trashFolder}
        folderOptions={folderOptions}
        getHasUnreadSelected={getHasUnreadSelected}
        onMarkAsRead={onMarkAsRead}
        onMoveMessages={onMoveMessages}
      />
    </ContextMenu>
  )
})

// -------------------------------------------------------------------------
// MailListToolbar – memoized toolbar component with a stable, narrow prop
// interface. All callbacks passed to this component are stable useCallback
// closures that read mutable state through refs, so their identities never
// change between renders. The two state-derived props (selectAllChecked and
// hasSelection) only change at natural transition boundaries, not on every
// individual row checkbox toggle. This means MailListToolbar re-renders only
// when the toolbar's own visible content actually changes.
// -------------------------------------------------------------------------

interface MailListToolbarProps {
  /** Changes only at false → "indeterminate" → true boundaries. */
  selectAllChecked: true | "indeterminate" | false
  /** Changes only at the 0 ↔ non-zero boundary. */
  hasSelection: boolean
  folder: string
  folderOptions: Array<{ path: string; name: string }>
  trashFolder: string | undefined
  junkFolder: string | undefined
  isSyncing: boolean
  isSyncPending: boolean
  onToggleSelectAll: () => void
  onSelectAll: () => void
  onSelectNone: () => void
  onSelectRead: () => void
  onSelectUnread: () => void
  onSync: () => void
  onReportSpam: () => void
  onDelete: () => void
  onMarkAsRead: () => void
  onMarkAsUnread: () => void
  onMoveTo: (destinationFolder: string) => void
  onCompose: () => void
}

const MailListToolbar = memo(function MailListToolbar({
  selectAllChecked,
  hasSelection,
  folder,
  folderOptions,
  trashFolder,
  junkFolder,
  isSyncing,
  isSyncPending,
  onToggleSelectAll,
  onSelectAll,
  onSelectNone,
  onSelectRead,
  onSelectUnread,
  onSync,
  onReportSpam,
  onDelete,
  onMarkAsRead,
  onMarkAsUnread,
  onMoveTo,
  onCompose,
}: MailListToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b px-4 py-2">
      <div className="flex items-center gap-1">
        <Checkbox
          checked={selectAllChecked}
          onCheckedChange={onToggleSelectAll}
          aria-label="Select all"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs">
              <ChevronDownIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={onSelectAll}>All</DropdownMenuItem>
            <DropdownMenuItem onClick={onSelectNone}>None</DropdownMenuItem>
            <DropdownMenuItem onClick={onSelectRead}>Read</DropdownMenuItem>
            <DropdownMenuItem onClick={onSelectUnread}>Unread</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-1">
        {/*
          Both the Sync button and batch-action region are always kept in the
          DOM. Using className="hidden" instead of conditional rendering avoids
          the mount/unmount expense (and resulting layout reflow) that occurs
          when the first row is selected or the last row is deselected.
        */}
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-1.5 text-muted-foreground", hasSelection && "hidden")}
          disabled={isSyncing || isSyncPending}
          onClick={onSync}
        >
          <RefreshCwIcon className={cn("size-4", isSyncing && "animate-spin")} />
          {isSyncing ? "Syncing…" : "Sync"}
        </Button>

        <div className={cn("flex items-center gap-1", !hasSelection && "hidden")}>
          {junkFolder && !isDraftsFolder(folder) && !isTrashFolder(folder) && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={onReportSpam}
            >
              <AlertOctagonIcon className="size-4" />
              Report spam
            </Button>
          )}
          {trashFolder && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={onDelete}
            >
              <Trash2Icon className="size-4" />
              Delete
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={onMarkAsRead}
          >
            <MailOpenIcon className="size-4" />
            Mark as read
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={onMarkAsUnread}
          >
            <MailIcon className="size-4" />
            Mark as unread
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <FolderInputIcon className="size-4" />
                Move to
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {folderOptions.map((f) => (
                <DropdownMenuItem key={f.path} onClick={() => onMoveTo(f.path)}>
                  {f.name === "INBOX" ? "Inbox" : f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="ml-auto">
        <Button size="lg" className="gap-1.5" onClick={onCompose}>
          <PenSquareIcon className="size-4" />
          Write Message
        </Button>
      </div>
    </div>
  )
})

export function MailList({ folder }: { folder: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [composerOpen, setComposerOpen] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const { data: accounts } = api.mailAccount.list.useQuery()
  const userEmails = useMemo(
    () => (accounts ?? []).map((a) => a.email.toLowerCase()),
    [accounts],
  )

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = api.mail.listMessages.useInfiniteQuery(
    { folder, limit: 50 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  )

  const messages = useMemo(
    () => data?.pages.flatMap((page) => page.messages) ?? [],
    [data],
  )

  // Folder list for batch actions (Trash, Junk, Move To)
  const { data: folders } = api.mail.listFolders.useQuery({})
  const trashFolder = folders?.find((f) => f.specialUse === "\\Trash")?.path
  const junkFolder = folders?.find((f) => f.specialUse === "\\Junk")?.path

  const utils = api.useUtils()

  const syncStatus = api.mail.getSyncStatus.useQuery({}, {
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "syncing" || status === "pending" ? 3000 : 30000
    },
  })
  const isSyncing = syncStatus.data?.status === "syncing" || syncStatus.data?.status === "pending"

  const triggerSync = api.mail.triggerSync.useMutation({
    onSuccess: () => {
      void syncStatus.refetch()
    },
  })

  // When sync finishes, refetch messages for the visible folder and update folder counts
  const prevSyncStatus = useRef(syncStatus.data?.status)
  useEffect(() => {
    const prev = prevSyncStatus.current
    const curr = syncStatus.data?.status
    prevSyncStatus.current = curr
    if ((prev === "syncing" || prev === "pending") && curr !== "syncing" && curr !== "pending") {
      void utils.mail.listMessages.invalidate({ folder, limit: 50 })
      void utils.mail.listFolders.invalidate()
    }
  }, [syncStatus.data?.status, utils, folder])

  const batchMarkAsRead = api.mail.batchMarkAsRead.useMutation({
    onMutate: async (variables) => {
      await utils.mail.listMessages.cancel()
      const previousMessages = utils.mail.listMessages.getInfiniteData({ folder, limit: 50 })
      utils.mail.listMessages.setInfiniteData({ folder, limit: 50 }, (oldData) => {
        if (!oldData) return oldData
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            messages: page.messages.map((msg) =>
              variables.uids.includes(msg.uid) ? { ...msg, read: variables.read } : msg
            ),
          })),
        }
      })
      setSelected(new Set())
      return { previousMessages }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        utils.mail.listMessages.setInfiniteData({ folder, limit: 50 }, context.previousMessages)
      }
    },
    onSettled: () => {
      void utils.mail.listMessages.invalidate({ folder, limit: 50 })
      void utils.mail.listFolders.invalidate()
    },
  })

  const batchMoveMessages = api.mail.batchMoveMessages.useMutation({
    onMutate: async (variables) => {
      await utils.mail.listMessages.cancel()
      const previousMessages = utils.mail.listMessages.getInfiniteData({ folder, limit: 50 })
      utils.mail.listMessages.setInfiniteData({ folder, limit: 50 }, (oldData) => {
        if (!oldData) return oldData
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((msg) => !variables.uids.includes(msg.uid)),
          })),
        }
      })
      setSelected(new Set())
      return { previousMessages }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        utils.mail.listMessages.setInfiniteData({ folder, limit: 50 }, context.previousMessages)
      }
    },
    onSettled: (_data, _error, variables) => {
      void utils.mail.listMessages.invalidate({ folder, limit: 50 })
      void utils.mail.listMessages.invalidate({ folder: variables.destinationFolder, limit: 50 })
      void utils.mail.listFolders.invalidate()
    },
  })

  // Stable ref so mutation callbacks can read the current UIDs without
  // including the full selected Set in their dependency arrays.
  const selectedUidsRef = useRef<number[]>([])
  const selectedUids = useMemo(() => Array.from(selected).map(Number), [selected])
  selectedUidsRef.current = selectedUids

  const hasUnreadSelectedRef = useRef(false)
  hasUnreadSelectedRef.current = useMemo(
    () => messages.some((m) => selected.has(String(m.uid)) && !m.read),
    [messages, selected],
  )
  // Stable getter — identity never changes, reads current value from the ref.
  const getHasUnreadSelected = useCallback(() => hasUnreadSelectedRef.current, [])

  const folderOptions = useMemo(
    () => folders?.filter((f) => f.path !== folder) ?? [],
    [folders, folder],
  )

  // Stable mutation handlers — read selectedUids through the ref so the
  // callbacks do not need to be recreated whenever selection changes.
  const markAsReadMutate = batchMarkAsRead.mutate
  const moveMessagesMutate = batchMoveMessages.mutate

  const handleMarkAsRead = useCallback(
    (read: boolean) => {
      markAsReadMutate({ folder, uids: selectedUidsRef.current, read })
    },
    [markAsReadMutate, folder],
  )

  const handleMoveMessages = useCallback(
    (destinationFolder: string) => {
      moveMessagesMutate({ folder, uids: selectedUidsRef.current, destinationFolder })
    },
    [moveMessagesMutate, folder],
  )

  // -----------------------------------------------------------------------
  // Refs for stable toolbar callbacks — keep mutable values accessible to
  // zero-dep useCallback closures without widening their dependency arrays.
  // -----------------------------------------------------------------------
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const junkFolderRef = useRef(junkFolder)
  junkFolderRef.current = junkFolder

  const trashFolderRef = useRef(trashFolder)
  trashFolderRef.current = trashFolder

  // Stable toolbar selection callbacks — read from refs so identities never
  // change, preventing MailListToolbar from re-rendering on selection changes.
  const handleSelectAll = useCallback(
    () => setSelected(new Set(messagesRef.current.map((m) => String(m.uid)))),
    [],
  )
  const handleSelectNone = useCallback(() => setSelected(new Set()), [])
  const handleSelectRead = useCallback(
    () => setSelected(new Set(messagesRef.current.filter((m) => m.read).map((m) => String(m.uid)))),
    [],
  )
  const handleSelectUnread = useCallback(
    () => setSelected(new Set(messagesRef.current.filter((m) => !m.read).map((m) => String(m.uid)))),
    [],
  )

  // Stable toolbar batch action callbacks.
  const handleBatchMarkAsRead = useCallback(
    () => markAsReadMutate({ folder, uids: selectedUidsRef.current, read: true }),
    [markAsReadMutate, folder],
  )
  const handleBatchMarkAsUnread = useCallback(
    () => markAsReadMutate({ folder, uids: selectedUidsRef.current, read: false }),
    [markAsReadMutate, folder],
  )
  const handleReportSpam = useCallback(() => {
    if (junkFolderRef.current) {
      moveMessagesMutate({ folder, uids: selectedUidsRef.current, destinationFolder: junkFolderRef.current })
    }
  }, [moveMessagesMutate, folder])
  const handleDeleteMail = useCallback(() => {
    if (trashFolderRef.current) {
      moveMessagesMutate({ folder, uids: selectedUidsRef.current, destinationFolder: trashFolderRef.current })
    }
  }, [moveMessagesMutate, folder])
  const handleSync = useCallback(() => triggerSync.mutate({}), [triggerSync])
  const handleCompose = useCallback(() => setComposerOpen(true), [])

  // -----------------------------------------------------------------------
  // Coarse-grained toolbar state — changes only at transition boundaries
  // (false → "indeterminate" → true), not on every individual row toggle.
  // useMemo recomputes when selected.size changes, but returns the same
  // primitive string for most mid-list toggles, so React.memo on
  // MailListToolbar skips re-rendering when the result is unchanged.
  // -----------------------------------------------------------------------
  const selectAllChecked = useMemo<true | "indeterminate" | false>(
    () =>
      selected.size === messages.length
        ? true
        : selected.size > 0
          ? "indeterminate"
          : false,
    [selected.size, messages.length],
  )

  // Only changes at the 0 ↔ non-zero boundary — stable during all
  // mid-list multi-selects (going from 2→3 selected keeps this true).
  const hasSelection = selected.size > 0

  // Infinite scroll: observe the sentinel element
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage()
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: "200px",
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const toggleSelect = useCallback((id: string) => {
    const finishTrace = startInteractionTrace("mail-list.checkbox-toggle", id)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    finishTrace()
  }, [])

  const handleToggleSelectAll = useCallback(() => {
    const finishTrace = startInteractionTrace("mail-list.checkbox-toggle", "all")
    setSelected((prev) => {
      if (prev.size === messagesRef.current.length) return new Set()
      return new Set(messagesRef.current.map((m) => String(m.uid)))
    })
    finishTrace()
    // No deps — reads messages through messagesRef so identity never changes.
  }, [])

  const handleContextMenu = useCallback(
    (mailId: string) => {
      const finishTrace = startInteractionTrace("mail-list.context-menu-open", mailId)
      setSelected((prev) => (prev.has(mailId) ? prev : new Set([mailId])))
      finishTrace()
    },
    [],
  )

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="ml-auto h-10 w-36" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b px-4 py-3">
              <Skeleton className="size-5 shrink-0 rounded" />
              <Skeleton className="size-2 shrink-0 rounded-full" />
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircleIcon className="size-10 text-destructive" />
        <p className="text-sm text-muted-foreground">
          Failed to load messages: {error.message}
        </p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void refetch()}>
          <RefreshCwIcon className="size-4" />
          Retry
        </Button>
      </div>
    )
  }

  // Empty state
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            disabled={isSyncing || triggerSync.isPending}
            onClick={() => triggerSync.mutate({})}
          >
            <RefreshCwIcon className={cn("size-4", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing…" : "Sync"}
          </Button>
          <div className="ml-auto">
            <Button size="lg" className="gap-1.5" onClick={() => setComposerOpen(true)}>
              <PenSquareIcon className="size-4" />
              Write Message
            </Button>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <InboxIcon className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No messages in this folder</p>
        </div>
        <MailComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
      </div>
    )
  }

  return (
    <PerformanceProfiler id="mail-list.surface">
      <div className="flex flex-1 flex-col">
      {/* Toolbar */}
      <MailListToolbar
        selectAllChecked={selectAllChecked}
        hasSelection={hasSelection}
        folder={folder}
        folderOptions={folderOptions}
        trashFolder={trashFolder}
        junkFolder={junkFolder}
        isSyncing={isSyncing}
        isSyncPending={triggerSync.isPending}
        onToggleSelectAll={handleToggleSelectAll}
        onSelectAll={handleSelectAll}
        onSelectNone={handleSelectNone}
        onSelectRead={handleSelectRead}
        onSelectUnread={handleSelectUnread}
        onSync={handleSync}
        onReportSpam={handleReportSpam}
        onDelete={handleDeleteMail}
        onMarkAsRead={handleBatchMarkAsRead}
        onMarkAsUnread={handleBatchMarkAsUnread}
        onMoveTo={handleMoveMessages}
        onCompose={handleCompose}
      />

      {/* Mail list */}
      <div className="flex-1 overflow-y-auto">
        {messages.map((mail) => {
          const mailId = String(mail.uid)
          return (
            <MailRow
              key={mailId}
              mail={mail}
              folder={folder}
              isSelected={selected.has(mailId)}
              getHasUnreadSelected={getHasUnreadSelected}
              userEmails={userEmails}
              trashFolder={trashFolder}
              folderOptions={folderOptions}
              onToggleSelect={toggleSelect}
              onContextMenu={handleContextMenu}
              onMarkAsRead={handleMarkAsRead}
              onMoveMessages={handleMoveMessages}
            />
          )
        })}

        {/* Infinite scroll sentinel */}
        <div ref={loadMoreRef} className="flex justify-center py-4">
          {isFetchingNextPage && (
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

        <MailComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
      </div>
    </PerformanceProfiler>
  )
}
