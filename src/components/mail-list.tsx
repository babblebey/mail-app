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
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
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

function getDisplayName(contact: { name: string; address: string }): string {
  if (contact.name.trim()) {
    return contact.name.trim().split(/\s+/)[0]!
  }
  return contact.address.split("@")[0] ?? contact.address
}

function getRecipientLabel(
  to: { name: string; address: string }[],
  cc: { name: string; address: string }[],
): string {
  return [...to, ...cc].map(getDisplayName).join(", ")
}

export function MailList({ folder }: { folder: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [composerOpen, setComposerOpen] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

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
              <Skeleton className="size-9 shrink-0 rounded-lg" />
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
                aria-label={`Select mail from ${mail.from.name}`}
                className="shrink-0"
              />

              {/* Unread indicator */}
              <div className="flex w-2 shrink-0 justify-center">
                {!mail.read && (
                  <span className="size-2 rounded-full bg-primary" />
                )}
              </div>

              {/* Avatar */}
              <Avatar className="size-9 shrink-0 rounded-lg">
                <AvatarFallback className="text-xs font-semibold text-white rounded-lg bg-muted">
                  {getInitials(mail.from.name)}
                </AvatarFallback>
              </Avatar>

              {/* Content */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-3">
                <div className="flex min-w-0 items-center justify-between gap-2 md:w-44 md:shrink-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "truncate text-sm",
                        !mail.read ? "font-semibold text-foreground" : "text-foreground",
                      )}
                    >
                      {mail.from.name}
                    </span>
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
                  <span className="min-w-0 truncate text-sm text-muted-foreground">
                    - {mail.snippet}
                  </span>
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
