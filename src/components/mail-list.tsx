"use client"

import { useState, useCallback, useRef, useEffect } from "react"
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

export function MailList({ folder }: { folder: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [composerOpen, setComposerOpen] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const { data: accounts } = api.mailAccount.list.useQuery()
  const userEmails = (accounts ?? []).map((a) => a.email.toLowerCase())

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

  const messages = data?.pages.flatMap((page) => page.messages) ?? []

  console.log({ messages });

  // Folder list for batch actions (Trash, Junk, Move To)
  const { data: folders } = api.mail.listFolders.useQuery({})
  const trashFolder = folders?.find((f) => f.specialUse === "\\Trash")?.path
  const junkFolder = folders?.find((f) => f.specialUse === "\\Junk")?.path

  const utils = api.useUtils()

  const syncStatus = api.mail.getSyncStatus.useQuery({}, {
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "syncing" || status === "pending" ? 2000 : 30000
    },
  })
  const isSyncing = syncStatus.data?.status === "syncing" || syncStatus.data?.status === "pending"

  const triggerSync = api.mail.triggerSync.useMutation({
    onSuccess: () => {
      void syncStatus.refetch()
    },
  })

  // When sync finishes, refetch messages and folders
  const prevSyncStatus = useRef(syncStatus.data?.status)
  useEffect(() => {
    const prev = prevSyncStatus.current
    const curr = syncStatus.data?.status
    prevSyncStatus.current = curr
    if ((prev === "syncing" || prev === "pending") && curr !== "syncing" && curr !== "pending") {
      void utils.mail.listMessages.invalidate()
      void utils.mail.listFolders.invalidate()
    }
  }, [syncStatus.data?.status, utils])

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
      void utils.mail.listMessages.invalidate()
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
    onSettled: () => {
      void utils.mail.listMessages.invalidate()
      void utils.mail.listFolders.invalidate()
    },
  })

  const selectedUids = Array.from(selected).map(Number)

  const hasUnreadSelected = messages.some(
    (m) => selected.has(String(m.uid)) && !m.read,
  )

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

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === messages.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(messages.map((m) => String(m.uid))))
    }
  }

  const handleContextMenu = useCallback(
    (mailId: string) => {
      if (!selected.has(mailId)) {
        setSelected(new Set([mailId]))
      }
    },
    [selected],
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
    <div className="flex flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-1">
          <Checkbox
            checked={
              selected.size === messages.length
                ? true
                : selected.size > 0
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={toggleSelectAll}
            aria-label="Select all"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <ChevronDownIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setSelected(new Set(messages.map((m) => String(m.uid))))}>
                All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelected(new Set())}>
                None
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelected(new Set(messages.filter((m) => m.read).map((m) => String(m.uid))))}>
                Read
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelected(new Set(messages.filter((m) => !m.read).map((m) => String(m.uid))))}>
                Unread
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1">
          {selected.size === 0 ? (
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
          ) : (
            <>
              {junkFolder && !isDraftsFolder(folder) && !isTrashFolder(folder) && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => batchMoveMessages.mutate({ folder, uids: selectedUids, destinationFolder: junkFolder })}>
                  <AlertOctagonIcon className="size-4" />
                  Report spam
                </Button>
              )}
              {trashFolder && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => batchMoveMessages.mutate({ folder, uids: selectedUids, destinationFolder: trashFolder })}>
                  <Trash2Icon className="size-4" />
                  Delete
                </Button>
              )}
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => batchMarkAsRead.mutate({ folder, uids: selectedUids, read: true })}>
                <MailOpenIcon className="size-4" />
                Mark as read
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => batchMarkAsRead.mutate({ folder, uids: selectedUids, read: false })}>
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
                  {folders
                    ?.filter((f) => f.path !== folder)
                    .map((f) => (
                      <DropdownMenuItem key={f.path} onClick={() => batchMoveMessages.mutate({ folder, uids: selectedUids, destinationFolder: f.path })}>
                        {f.name === "INBOX" ? "Inbox" : f.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        <div className="ml-auto">
          <Button size="lg" className="gap-1.5" onClick={() => setComposerOpen(true)}>
            <PenSquareIcon className="size-4" />
            Write Message
          </Button>
        </div>
      </div>

      {/* Mail list */}
      <div className="flex-1 overflow-y-auto">
        {messages.map((mail) => {
          const mailId = String(mail.uid)
          const displayMode: "inbox" | "sent" | "drafts" = isTrashFolder(folder) || isJunkFolder(folder)
            ? classifyMixedFolderEmail(mail, userEmails)
            : isDraftsFolder(folder)
              ? "drafts"
              : isSentFolder(folder)
                ? "sent"
                : "inbox"
          const realRecipients = [...mail.to, ...mail.cc, ...mail.bcc].filter(isRealRecipient)
          const allRecipients = [...mail.to, ...mail.cc, ...mail.bcc]
          return (
            <ContextMenu key={mailId}>
              <ContextMenuTrigger asChild>
                <Link
                  href={`/dashboard/mail/${mail.uid}?folder=${encodeURIComponent(folder)}`}
                  className={cn(
                    "group flex items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/50",
                    selected.has(mailId) && "bg-muted/50",
                  )}
                  onContextMenu={() => handleContextMenu(mailId)}
                >
              <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <Checkbox
                  checked={selected.has(mailId)}
                  onCheckedChange={() => toggleSelect(mailId)}
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
                  {mail.snippet?.trim() && !(displayMode === "drafts" && !mail.snippet?.trim()) && (
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
            </Link>
              </ContextMenuTrigger>
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
                  <ContextMenuItem onClick={() => batchMoveMessages.mutate({ folder, uids: Array.from(selected).map(Number), destinationFolder: trashFolder })}>
                    <Trash2Icon className="size-4" />
                    Delete
                  </ContextMenuItem>
                )}
                {hasUnreadSelected ? (
                  <ContextMenuItem onClick={() => batchMarkAsRead.mutate({ folder, uids: Array.from(selected).map(Number), read: true })}>
                    <MailOpenIcon className="size-4" />
                    Mark as read
                  </ContextMenuItem>
                ) : (
                  <ContextMenuItem onClick={() => batchMarkAsRead.mutate({ folder, uids: Array.from(selected).map(Number), read: false })}>
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
                    {folders
                      ?.filter((f) => f.path !== folder)
                      .map((f) => (
                        <ContextMenuItem key={f.path} onClick={() => batchMoveMessages.mutate({ folder, uids: Array.from(selected).map(Number), destinationFolder: f.path })}>
                          <FolderIcon className="size-4" />
                          {f.name === "INBOX" ? "Inbox" : f.name}
                        </ContextMenuItem>
                      ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </ContextMenuContent>
            </ContextMenu>
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
  )
}
