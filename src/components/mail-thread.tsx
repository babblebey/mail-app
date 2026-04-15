"use client"

import { useState, useRef } from "react"
import {
  ArrowLeftIcon,
  ArchiveIcon,
  Trash2Icon,
  FolderIcon,
  MoreHorizontalIcon,
  PrinterIcon,
  ReplyIcon,
  ReplyAllIcon,
  ForwardIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  SendIcon,
  PaperclipIcon,
  SmileIcon,
  ImageIcon,
  LockIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  LinkIcon,
  ClockIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  FileIcon,
} from "lucide-react"
import Link from "next/link"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"
import { MailComposer } from "~/components/mail-composer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "~/components/ui/popover"
import { api } from "~/trpc/react"

function getInitials(name: string, email?: string) {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
  }
  const localPart = email?.split("@")[0] ?? ""
  return localPart.slice(0, 2).toUpperCase()
}

function formatDate(isoDate: string) {
  const d = new Date(isoDate)
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDetailDate(isoDate: string) {
  const d = new Date(isoDate)
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type MessageData = {
  uid: number
  messageId: string
  subject: string
  from: { name: string; address: string }
  to: { name: string; address: string }[]
  cc: { name: string; address: string }[]
  date: string
  textBody: string | null
  htmlBody: string | null
  attachments: { filename: string; contentType: string; size: number; cid?: string }[]
}

function MessageBody({ message }: { message: MessageData }) {
  if (message.htmlBody) {
    return (
      <div
        className="prose prose-sm max-w-none text-foreground prose-blockquote:not-italic"
        dangerouslySetInnerHTML={{ __html: message.htmlBody }}
      />
    )
  }
  if (message.textBody) {
    return (
      <div className="whitespace-pre-line text-sm leading-relaxed text-foreground">
        {message.textBody}
      </div>
    )
  }
  return (
    <p className="text-sm italic text-muted-foreground">No content available</p>
  )
}

function MessageView({
  message,
  folder,
  onReply,
}: {
  message: MessageData
  folder: string
  onReply?: () => void
}) {
  const toList = message.to.map((a) => a.name || a.address).join(", ")
  const ccList = message.cc.map((a) => a.name || a.address).join(", ")
  const recipients = ccList
    ? `${toList}, cc: ${ccList}`
    : toList

  return (
    <div>
      {/* Message header */}
      <div className="flex items-start gap-4 px-4 py-5">
        <Avatar className="size-10 shrink-0 rounded-full">
          <AvatarFallback className="text-sm font-semibold text-white rounded-full bg-muted">
            {getInitials(message.from.name, message.from.address)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">
                {message.from.name || message.from.address}
                {message.from.name && (
                  <span className="font-normal text-xs text-muted-foreground">
                    {" <"}{message.from.address}{">"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>to {recipients || "unknown"}</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" className="size-5 p-0 cursor-pointer">
                      <ChevronDownIcon className="size-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto max-w-md p-3">
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                      <span className="text-right text-sm text-muted-foreground">from:</span>
                      <span className="text-sm font-semibold text-foreground">
                        {message.from.name
                          ? `${message.from.name} <${message.from.address}>`
                          : message.from.address}
                      </span>
                      <span className="text-right text-sm text-muted-foreground">to:</span>
                      <span className="text-sm text-foreground">
                        {message.to
                          .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
                          .join(", ")}
                      </span>
                      {message.cc.length > 0 && (
                        <>
                          <span className="text-right text-sm text-muted-foreground">cc:</span>
                          <span className="text-sm text-foreground">
                            {message.cc
                              .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
                              .join(", ")}
                          </span>
                        </>
                      )}
                      <span className="text-right text-sm text-muted-foreground">subject:</span>
                      <span className="text-sm text-foreground">{message.subject}</span>
                      <span className="text-right text-sm text-muted-foreground">date:</span>
                      <span className="text-sm text-foreground">{formatDetailDate(message.date)}</span>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {formatDate(message.date)}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="default" onClick={onReply}>
                  <ReplyIcon className="size-5" />
                </Button>
                <Button variant="ghost" size="default">
                  <MoreHorizontalIcon className="size-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message body */}
      <div className="px-4 pb-4 pl-18">
        <MessageBody message={message} />
      </div>

      {/* Attachments */}
      {message.attachments.length > 0 && (
        <div className="px-4 pb-4 pl-18">
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{att.filename}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatSize(att.size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function MailThreadView({ uid, folder }: { uid: number; folder: string }) {
  const { data: message, isLoading, isError, error, refetch } = api.mail.getMessage.useQuery(
    { folder, uid },
  )

  const [replyAction, setReplyAction] = useState<"reply" | "reply-all" | "forward" | null>(null)
  const [composerMode, setComposerMode] = useState<"inline" | "popout">("inline")
  const [replyBody, setReplyBody] = useState("")
  const inlineComposerRef = useRef<HTMLDivElement>(null)

  const backHref = `/dashboard?folder=${encodeURIComponent(folder)}`

  function openInlineComposer(action: "reply" | "reply-all" | "forward") {
    setReplyAction(action)
    setComposerMode("inline")
    requestAnimationFrame(() => {
      inlineComposerRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    })
  }

  function handlePopout() {
    setComposerMode("popout")
  }

  function handlePopIn() {
    setComposerMode("inline")
  }

  function handleDiscard() {
    setReplyAction(null)
    setReplyBody("")
    setComposerMode("inline")
  }

  const replyActionIcon = replyAction === "forward" ? ForwardIcon : replyAction === "reply-all" ? ReplyAllIcon : ReplyIcon
  const ReplyActionIcon = replyActionIcon

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <Skeleton className="size-8 rounded" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <Skeleton className="mb-6 h-7 w-2/3" />
          <div className="flex items-start gap-4">
            <Skeleton className="size-10 shrink-0 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-4 h-40 w-full" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <Link href={backHref}>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
              <ArrowLeftIcon className="size-4" />
            </Button>
          </Link>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertCircleIcon className="size-10 text-destructive" />
          <p className="text-sm text-muted-foreground">
            Failed to load message: {error.message}
          </p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void refetch()}>
            <RefreshCwIcon className="size-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (!message) return null

  const replyRecipients = [
    ...message.to.map((a) => a.name || a.address),
  ].join(", ")

  return (
    <div className="flex flex-1 flex-col">
      {/* Thread toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Link href={backHref}>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
            <ArrowLeftIcon className="size-4" />
          </Button>
        </Link>

        <Separator orientation="vertical" className="mx-1 data-vertical:h-full" />

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <ArchiveIcon className="size-4" />
            Archive
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <FolderIcon className="size-4" />
            Move
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Trash2Icon className="size-4" />
            Delete
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
            <PrinterIcon className="size-4" />
          </Button>
        </div>
      </div>

      {/* Thread content */}
      <div className="flex-1 overflow-y-auto">
        <div className="py-6">
          {/* Subject line */}
          <div className="mb-6 flex items-center gap-2 px-4 md:px-18">
            <h1 className="text-xl font-semibold text-foreground">
              {message.subject}
            </h1>
            <Badge variant="secondary" className="rounded-sm text-xs">
              {folder}
            </Badge>
          </div>

          {/* Single message */}
          <MessageView
            message={message}
            folder={folder}
            onReply={() => openInlineComposer("reply")}
          />

          {/* Reply actions */}
          {!replyAction && (
            <div className="mt-4 mb-12 flex items-center gap-2 px-4 md:px-18">
              <Button variant="outline" size="default" className="gap-1.5" onClick={() => openInlineComposer("reply")}>
                <ReplyIcon className="size-4" />
                Reply
              </Button>
              <Button variant="outline" size="default" className="gap-1.5" onClick={() => openInlineComposer("reply-all")}>
                <ReplyAllIcon className="size-4" />
                Reply all
              </Button>
              <Button variant="outline" size="default" className="gap-1.5" onClick={() => openInlineComposer("forward")}>
                <ForwardIcon className="size-4" />
                Forward
              </Button>
            </div>
          )}

          {/* Inline Composer */}
          {replyAction && composerMode === "inline" && (
            <div ref={inlineComposerRef} className="pb-4 mx-4 mt-4 mb-12 md:mx-18">
              <div className="rounded-xl border bg-background shadow-sm">
                {/* Composer header - recipients & popout */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ReplyActionIcon className="size-4 shrink-0" />
                    <span className="truncate">{replyRecipients}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Pop out reply"
                    onClick={handlePopout}
                  >
                    <ExternalLinkIcon className="size-3.5" />
                  </Button>
                </div>

                {/* Text body */}
                <div className="min-h-24 px-4 pb-3">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    className="size-full min-h-24 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
                    placeholder=""
                  />
                </div>

                {/* More options (collapsed content indicator) */}
                <div className="px-4 pb-2">
                  <Button variant="ghost" size="icon-xs">
                    <MoreHorizontalIcon className="size-4" />
                  </Button>
                </div>

                {/* Formatting toolbar */}
                <div className="flex flex-wrap items-center gap-0.5 border-t px-3 py-1.5">
                  <Button variant="ghost" size="icon-xs" title="Bold">
                    <BoldIcon className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-xs" title="Italic">
                    <ItalicIcon className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-xs" title="Underline">
                    <UnderlineIcon className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-xs" title="Strikethrough">
                    <StrikethroughIcon className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-xs" title="Insert link">
                    <LinkIcon className="size-3.5" />
                  </Button>
                </div>

                {/* Bottom toolbar - Send + actions */}
                <div className="flex items-center gap-1 border-t px-3 py-2">
                  <div className="flex items-center">
                    <Button
                      size="default"
                      className="gap-1.5 rounded-r-none"
                    >
                      <SendIcon className="size-4" />
                      Send
                    </Button>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="default"
                          className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
                        >
                          <ChevronDownIcon className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" side="top">
                        <DropdownMenuItem>
                          <ClockIcon className="size-3.5" />
                          Send Later
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="ml-auto flex items-center gap-0.5">
                    <Button variant="ghost" size="icon-xs" title="Attach file">
                      <PaperclipIcon className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" title="Insert emoji">
                      <SmileIcon className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" title="Insert image">
                      <ImageIcon className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" title="Confidential">
                      <LockIcon className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" title="More options">
                      <MoreHorizontalIcon className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Discard"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={handleDiscard}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Popout composer */}
      <MailComposer
        open={replyAction !== null && composerMode === "popout"}
        onClose={handlePopIn}
      />
    </div>
  )
}
