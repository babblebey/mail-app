"use client"

import * as React from "react"
import {
  XIcon,
  MinusIcon,
  MaximizeIcon,
  MinimizeIcon,
  SendIcon,
  Trash2Icon,
  PaperclipIcon,
  SmileIcon,
  ImageIcon,
  LockIcon,
  PenToolIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  LinkIcon,
  MoreHorizontalIcon,
  FileTextIcon,
  ChevronDownIcon,
  ClockIcon,
} from "lucide-react"
import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

interface Recipient {
  name: string
  email: string
}

interface Attachment {
  name: string
  size: string
}

export function MailComposer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [minimized, setMinimized] = React.useState(false)
  const [maximized, setMaximized] = React.useState(false)
  const [showCc, setShowCc] = React.useState(false)
  const [showBcc, setShowBcc] = React.useState(false)

  const [recipients, setRecipients] = React.useState<Recipient[]>([])
  const [ccRecipients, setCcRecipients] = React.useState<Recipient[]>([])
  const [bccRecipients, setBccRecipients] = React.useState<Recipient[]>([])
  const [toInput, setToInput] = React.useState("")
  const [ccInput, setCcInput] = React.useState("")
  const [bccInput, setBccInput] = React.useState("")
  const [subject, setSubject] = React.useState("")
  const [body, setBody] = React.useState("")
  const [attachments, setAttachments] = React.useState<Attachment[]>([])

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  if (!open) return null

  function handleAddRecipient(
    input: string,
    setInput: (v: string) => void,
    list: Recipient[],
    setList: (v: Recipient[]) => void
  ) {
    const trimmed = input.trim()
    if (!trimmed) return
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (emailRegex.test(trimmed)) {
      setList([...list, { name: trimmed.split("@")[0] ?? trimmed, email: trimmed }])
      setInput("")
    }
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    input: string,
    setInput: (v: string) => void,
    list: Recipient[],
    setList: (v: Recipient[]) => void
  ) {
    if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      e.preventDefault()
      handleAddRecipient(input, setInput, list, setList)
    }
    if (e.key === "Backspace" && !input && list.length > 0) {
      setList(list.slice(0, -1))
    }
  }

  function removeRecipient(
    index: number,
    list: Recipient[],
    setList: (v: Recipient[]) => void
  ) {
    setList(list.filter((_, i) => i !== index))
  }

  function handleFileAttach() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const newAttachments: Attachment[] = Array.from(files).map((f) => ({
      name: f.name,
      size: f.size < 1024 ? `${f.size} B` : `${(f.size / 1024).toFixed(0)} KB`,
    }))
    setAttachments((prev) => [...prev, ...newAttachments])
    e.target.value = ""
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col rounded-xl border bg-background shadow-2xl transition-all",
        maximized
          ? "inset-4 rounded-xl"
          : minimized
            ? "bottom-0 right-6 h-12 w-120"
            : "bottom-6 right-6 h-130 w-120"
      )}
    >
      {/* Header */}
      <div
        className="flex h-12 shrink-0 cursor-pointer items-center justify-between rounded-t-xl bg-amber-400 px-4"
        onClick={() => minimized && setMinimized(false)}
      >
        <span className="text-sm font-semibold text-amber-950">New Message</span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMinimized(!minimized)
              if (maximized) setMaximized(false)
            }}
            className="rounded p-1 text-amber-950 hover:bg-amber-500/50"
          >
            <MinusIcon className="size-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMaximized(!maximized)
              if (minimized) setMinimized(false)
            }}
            className="rounded p-1 text-amber-950 hover:bg-amber-500/50"
          >
            {maximized ? (
              <MinimizeIcon className="size-4" />
            ) : (
              <MaximizeIcon className="size-4" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="rounded p-1 text-amber-950 hover:bg-amber-500/50"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Body - hidden when minimized */}
      {!minimized && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* To field */}
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <span className="shrink-0 text-sm text-muted-foreground">To</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {recipients.map((r, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                >
                  {r.name}
                  <button
                    onClick={() => removeRecipient(i, recipients, setRecipients)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                onKeyDown={(e) =>
                  handleKeyDown(e, toInput, setToInput, recipients, setRecipients)
                }
                onBlur={() =>
                  handleAddRecipient(toInput, setToInput, recipients, setRecipients)
                }
                className="min-w-30 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder={recipients.length === 0 ? "Recipients" : ""}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!showCc && (
                <button
                  onClick={() => setShowCc(true)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  CC
                </button>
              )}
              {!showBcc && (
                <button
                  onClick={() => setShowBcc(true)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  BCC
                </button>
              )}
            </div>
          </div>

          {/* CC field */}
          {showCc && (
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <span className="shrink-0 text-sm text-muted-foreground">Cc</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {ccRecipients.map((r, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                  >
                    {r.name}
                    <button
                      onClick={() => removeRecipient(i, ccRecipients, setCcRecipients)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  onKeyDown={(e) =>
                    handleKeyDown(e, ccInput, setCcInput, ccRecipients, setCcRecipients)
                  }
                  onBlur={() =>
                    handleAddRecipient(ccInput, setCcInput, ccRecipients, setCcRecipients)
                  }
                  className="min-w-30 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder=""
                />
              </div>
            </div>
          )}

          {/* BCC field */}
          {showBcc && (
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <span className="shrink-0 text-sm text-muted-foreground">Bcc</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {bccRecipients.map((r, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                  >
                    {r.name}
                    <button
                      onClick={() => removeRecipient(i, bccRecipients, setBccRecipients)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={bccInput}
                  onChange={(e) => setBccInput(e.target.value)}
                  onKeyDown={(e) =>
                    handleKeyDown(
                      e,
                      bccInput,
                      setBccInput,
                      bccRecipients,
                      setBccRecipients
                    )
                  }
                  onBlur={() =>
                    handleAddRecipient(
                      bccInput,
                      setBccInput,
                      bccRecipients,
                      setBccRecipients
                    )
                  }
                  className="min-w-30 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder=""
                />
              </div>
            </div>
          )}

          {/* Subject field */}
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <span className="shrink-0 text-sm text-muted-foreground">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder=""
            />
          </div>

          {/* Text body */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="size-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
              placeholder="Write your message..."
            />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t px-4 py-2">
              {attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5"
                >
                  <FileTextIcon className="size-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="max-w-45 truncate text-xs font-medium">
                      {att.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{att.size}</span>
                  </div>
                  <button
                    onClick={() => removeAttachment(i)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Writing Assistant badge */}
          <div className="px-4 pb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              <PenToolIcon className="size-3.5 text-primary" />
              Writing Assistant
            </span>
          </div>

          {/* Bottom toolbar */}
          <div className="flex items-center gap-1 border-t px-3 py-2">
            <div className="flex items-center">
              <Button
                size="default"
                className="gap-1.5 rounded-r-none"
                onClick={() => {
                  /* send logic */
                }}
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

            <div className="flex items-center gap-0.5 border-l pl-2 ml-1">
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

            <div className="ml-auto flex items-center gap-0.5">
              <Button variant="ghost" size="icon-xs" title="Attach file" onClick={handleFileAttach}>
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
                onClick={onClose}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      )}
    </div>
  )
}
