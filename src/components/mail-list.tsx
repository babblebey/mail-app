"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import Link from "next/link"
import {
  ArchiveIcon,
  FolderIcon,
  Trash2Icon,
  PenSquareIcon,
  ChevronDownIcon,
  MoreHorizontalIcon,
  StarIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  InboxIcon,
  Loader2Icon,
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

function classifyTrashEmail(
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
          <Button variant="ghost" size="icon-xs">
            <ChevronDownIcon className="size-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <ArchiveIcon className="size-4" />
            Archive
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <FolderIcon className="size-4" />
            Folder
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Trash2Icon className="size-4" />
            Delete
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
            <MoreHorizontalIcon className="size-4" />
          </Button>
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
          const displayMode: "inbox" | "sent" | "drafts" = isTrashFolder(folder)
            ? classifyTrashEmail(mail, userEmails)
            : isDraftsFolder(folder)
              ? "drafts"
              : isSentFolder(folder)
                ? "sent"
                : "inbox"
          const realRecipients = [...mail.to, ...mail.cc, ...mail.bcc].filter(isRealRecipient)
          const allRecipients = [...mail.to, ...mail.cc, ...mail.bcc]
          return (
            <Link
              key={mailId}
              href={`/dashboard/mail/${mail.uid}?folder=${encodeURIComponent(folder)}`}
              className={cn(
                "group flex items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/50",
                selected.has(mailId) && "bg-muted/50",
              )}
            >
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

              {/* Unread indicator */}
              <div className="flex w-2 shrink-0 justify-center">
                {!mail.read && (
                  <span className="size-2 rounded-full bg-primary" />
                )}
              </div>

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
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-3">
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
                      "shrink-0 truncate text-sm max-w-[50%]",
                      !mail.read ? "font-semibold text-foreground" : "text-foreground",
                    )}
                  >
                    {mail.subject}
                  </span>
                  {!(displayMode === "drafts" && !mail.snippet?.trim()) && (
                    <span className="min-w-0 truncate text-sm text-muted-foreground">
                      - {mail.snippet}
                    </span>
                  )}
                </div>

                {/* Date on desktop */}
                <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
                  {formatDate(mail.date)}
                </span>
              </div>
            </Link>
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
