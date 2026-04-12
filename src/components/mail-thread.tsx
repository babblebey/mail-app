"use client"

import * as React from "react"
import { useState } from "react"
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
  XIcon,
} from "lucide-react"
import Link from "next/link"

import { cn } from "~/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"

export interface ThreadMessage {
  id: string
  sender: string
  email: string
  avatar?: string
  avatarColor?: string
  recipients: string
  date: string
  body: string
  starred?: boolean
}

export interface MailThread {
  id: string
  subject: string
  labels: string[]
  messages: ThreadMessage[]
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

// Sample thread data
const sampleThread: MailThread = {
  id: "1",
  subject: "Full Time UI Designer - Judha Maygustya",
  labels: ["Inbox"],
  messages: [
    {
      id: "m1",
      sender: "Judha Maygustya",
      email: "judha@example.com",
      avatarColor: "bg-amber-500",
      recipients: "to Azie Melasari",
      date: "Thu, Mar 12, 11:28 AM",
      body: "Dear Mrs Azie Melasari,\n\nI hope you are doing well. I wanted to share my portfolio and express my interest in the Full Time UI Designer position at your company.\n\nI have over 5 years of experience in creating user-centered designs and would love the opportunity to contribute to your team. My portfolio includes work with companies like TechCorp, DesignHub, and several startups.\n\nPlease let me know if you need any additional materials or if you'd like to schedule an interview.\n\nBest regards,\nJudha Maygustya",
      starred: false,
    },
    {
      id: "m2",
      sender: "Azie Melasari",
      email: "azie@example.com",
      avatarColor: "bg-violet-600",
      recipients: "to Judha Maygustya",
      date: "Mon, Mar 16, 1:55 PM",
      body: "Hi Judha,\n\nThank you for your application. Your portfolio looks impressive, and we'd love to learn more about your experience.\n\nCould you please provide some additional references and let us know your earliest availability to start?\n\nLooking forward to hearing from you.\n\nBest,\nAzie Melasari",
      starred: true,
    },
    {
      id: "m3",
      sender: "Judha Maygustya",
      email: "judha@example.com",
      avatarColor: "bg-amber-500",
      recipients: "to Azie Melasari",
      date: "Tue, Mar 24, 5:34 PM",
      body: "Hello Azie,\n\nThank you for the update. I'm glad to hear you found my portfolio interesting.\n\nI can provide references from my previous employers. I'm available to start as early as next month.\n\nPlease let me know what the next steps in the process are.\n\nBest regards,\nJudha Maygustya",
      starred: false,
    },
    {
      id: "m4",
      sender: "Azie Melasari",
      email: "azie@example.com",
      avatarColor: "bg-violet-600",
      recipients: "to Judha, HR Team",
      date: "Wed, Mar 25, 10:24 AM",
      body: "Hi Judha,\n\nThanks for getting back to us so quickly.\n\nWe'd like to invite you for a design challenge and interview session next week. Our HR team will reach out with the specific time slots.\n\nWe're excited about the possibility of having you on board!\n\nBest,\nAzie Melasari",
      starred: false,
    },
  ],
}

function CollapsedMessage({
  message,
  isLast,
  onClick,
}: {
  message: ThreadMessage
  isLast?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-4 px-4 py-5 text-left transition-colors hover:bg-muted/50",
        !isLast && "border-b border-border"
      )}
    >
      <Avatar className="size-10 shrink-0 rounded-lg">
        {message.avatar ? (
          <AvatarImage src={message.avatar} alt={message.sender} />
        ) : null}
        <AvatarFallback
          className={cn(
            "text-sm font-semibold text-white rounded-lg",
            message.avatarColor ?? "bg-muted"
          )}
        >
          {getInitials(message.sender)}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {message.sender}
            </span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {message.date}
          </span>
        </div>
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {message.body.split("\n")[0]}
        </span>
      </div>
    </button>
  )
}

function ExpandedMessage({ message, isLast, onCollapse }: { message: ThreadMessage; isLast?: boolean; onCollapse?: () => void }) {
  return (
    <div className={cn(!isLast && "border-b border-border")}>
      {/* Message header */}
      <div
        className={cn(
          "flex items-start gap-4 px-4 py-5",
          !isLast && "cursor-pointer"
        )}
        onClick={!isLast ? onCollapse : undefined}
      >
        <Avatar className="size-10 shrink-0 rounded-lg">
          {message.avatar ? (
            <AvatarImage src={message.avatar} alt={message.sender} />
          ) : null}
          <AvatarFallback
            className={cn(
              "text-sm font-semibold text-white rounded-lg",
              message.avatarColor ?? "bg-muted"
            )}
          >
            {getInitials(message.sender)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">
                {message.sender}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{message.recipients}</span>
                    <ChevronDownIcon className="size-3" />
                </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {message.date}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="default">
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
        <div className="whitespace-pre-line text-sm leading-relaxed text-foreground">
          {message.body}
        </div>
      </div>
    </div>
  )
}

export function MailThreadView({ threadId }: { threadId: string }) {
  const thread = sampleThread // In real app, fetch by threadId

  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    // Last message expanded by default
    new Set([thread.messages[thread.messages.length - 1]!.id])
  )

  function toggleMessage(id: string) {
    setExpandedMessages((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Thread toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
            <ArrowLeftIcon className="size-4" />
          </Button>
        </Link>

        <Separator orientation="vertical" className="mx-1 data-vertical:h-4" />

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
              {thread.subject}
            </h1>
            {thread.labels.map((label) => (
              <Badge
                key={label}
                variant="secondary"
                className="rounded-sm text-xs"
              >
                {label}
                <button
                  type="button"
                  className="ml-1 inline-flex items-center"
                  aria-label={`Remove ${label} label`}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
          </div>

          {/* Messages */}
          <div className="flex flex-col">
            {thread.messages.map((message, index) =>
              expandedMessages.has(message.id) ? (
                <ExpandedMessage key={message.id} message={message} isLast={index === thread.messages.length - 1} onCollapse={() => toggleMessage(message.id)} />
              ) : (
                <CollapsedMessage
                  key={message.id}
                  message={message}
                  isLast={index === thread.messages.length - 1}
                  onClick={() => toggleMessage(message.id)}
                />
              )
            )}
          </div>

          {/* Reply actions */}
          <div className="mt-4 mb-12 flex items-center gap-2 px-4 md:px-18">
            <Button variant="outline" size="default" className="gap-1.5">
              <ReplyIcon className="size-4" />
              Reply
            </Button>
            <Button variant="outline" size="default" className="gap-1.5">
              <ReplyAllIcon className="size-4" />
              Reply all
            </Button>
            <Button variant="outline" size="default" className="gap-1.5">
              <ForwardIcon className="size-4" />
              Forward
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
