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
import {
  PerformanceProfiler,
  startInteractionTrace,
} from "~/components/performance-profiler"

interface Recipient {
  name: string
  email: string
}

interface Attachment {
  name: string
  size: string
}

// ---------------------------------------------------------------------------
// Composer state reducer
// ---------------------------------------------------------------------------

interface ComposerState {
  minimized: boolean
  maximized: boolean
  showCc: boolean
  showBcc: boolean
  recipients: Recipient[]
  ccRecipients: Recipient[]
  bccRecipients: Recipient[]
  toInput: string
  ccInput: string
  bccInput: string
  subject: string
  body: string
  attachments: Attachment[]
}

type ComposerAction =
  | { type: "TOGGLE_MINIMIZED" }
  | { type: "TOGGLE_MAXIMIZED" }
  | { type: "SHOW_CC" }
  | { type: "SHOW_BCC" }
  | { type: "SET_TO_INPUT"; value: string }
  | { type: "SET_CC_INPUT"; value: string }
  | { type: "SET_BCC_INPUT"; value: string }
  | { type: "ADD_RECIPIENT"; field: "to" | "cc" | "bcc" }
  | { type: "REMOVE_RECIPIENT"; field: "to" | "cc" | "bcc"; index: number }
  | { type: "REMOVE_LAST_RECIPIENT"; field: "to" | "cc" | "bcc" }
  | { type: "SET_SUBJECT"; value: string }
  | { type: "SET_BODY"; value: string }
  | { type: "ADD_ATTACHMENTS"; files: Attachment[] }
  | { type: "REMOVE_ATTACHMENT"; index: number }

const initialComposerState: ComposerState = {
  minimized: false,
  maximized: false,
  showCc: false,
  showBcc: false,
  recipients: [],
  ccRecipients: [],
  bccRecipients: [],
  toInput: "",
  ccInput: "",
  bccInput: "",
  subject: "",
  body: "",
  attachments: [],
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function composerReducer(state: ComposerState, action: ComposerAction): ComposerState {
  switch (action.type) {
    case "TOGGLE_MINIMIZED":
      return { ...state, minimized: !state.minimized, maximized: false }
    case "TOGGLE_MAXIMIZED":
      return { ...state, maximized: !state.maximized, minimized: false }
    case "SHOW_CC":
      return { ...state, showCc: true }
    case "SHOW_BCC":
      return { ...state, showBcc: true }
    case "SET_TO_INPUT":
      return { ...state, toInput: action.value }
    case "SET_CC_INPUT":
      return { ...state, ccInput: action.value }
    case "SET_BCC_INPUT":
      return { ...state, bccInput: action.value }
    case "ADD_RECIPIENT": {
      const inputKey = action.field === "to" ? "toInput" : action.field === "cc" ? "ccInput" : "bccInput"
      const listKey = action.field === "to" ? "recipients" : action.field === "cc" ? "ccRecipients" : "bccRecipients"
      const trimmed = (state[inputKey] as string).trim()
      if (!trimmed || !EMAIL_REGEX.test(trimmed)) return state
      return {
        ...state,
        [listKey]: [
          ...(state[listKey] as Recipient[]),
          { name: trimmed.split("@")[0] ?? trimmed, email: trimmed },
        ],
        [inputKey]: "",
      }
    }
    case "REMOVE_RECIPIENT": {
      const listKey = action.field === "to" ? "recipients" : action.field === "cc" ? "ccRecipients" : "bccRecipients"
      return {
        ...state,
        [listKey]: (state[listKey] as Recipient[]).filter((_, i) => i !== action.index),
      }
    }
    case "REMOVE_LAST_RECIPIENT": {
      const listKey = action.field === "to" ? "recipients" : action.field === "cc" ? "ccRecipients" : "bccRecipients"
      const list = state[listKey] as Recipient[]
      if (list.length === 0) return state
      return { ...state, [listKey]: list.slice(0, -1) }
    }
    case "SET_SUBJECT":
      return { ...state, subject: action.value }
    case "SET_BODY":
      return { ...state, body: action.value }
    case "ADD_ATTACHMENTS":
      return { ...state, attachments: [...state.attachments, ...action.files] }
    case "REMOVE_ATTACHMENT":
      return { ...state, attachments: state.attachments.filter((_, i) => i !== action.index) }
    default:
      return state
  }
}

export function MailComposer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [state, dispatch] = React.useReducer(composerReducer, initialComposerState)

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const traceComposerInteraction = React.useCallback(
    (
      name: "mail-composer.typing" | "mail-composer.recipient-edit",
      detail: string,
      update: () => void,
    ) => {
      const finishTrace = startInteractionTrace(name, detail)
      update()
      finishTrace()
    },
    [],
  )

  const handleAddRecipient = React.useCallback(
    (field: "to" | "cc" | "bcc") => {
      traceComposerInteraction("mail-composer.recipient-edit", "add-recipient", () => {
        dispatch({ type: "ADD_RECIPIENT", field })
      })
    },
    [traceComposerInteraction],
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, field: "to" | "cc" | "bcc") => {
      if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
        e.preventDefault()
        handleAddRecipient(field)
      }
      if (e.key === "Backspace" && !e.currentTarget.value) {
        traceComposerInteraction("mail-composer.recipient-edit", "remove-recipient-backspace", () => {
          dispatch({ type: "REMOVE_LAST_RECIPIENT", field })
        })
      }
    },
    [handleAddRecipient, traceComposerInteraction],
  )

  const removeRecipient = React.useCallback(
    (field: "to" | "cc" | "bcc", index: number) => {
      traceComposerInteraction("mail-composer.recipient-edit", "remove-recipient", () => {
        dispatch({ type: "REMOVE_RECIPIENT", field, index })
      })
    },
    [traceComposerInteraction],
  )

  const handleFileAttach = React.useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newAttachments: Attachment[] = Array.from(files).map((f) => ({
      name: f.name,
      size: f.size < 1024 ? `${f.size} B` : `${(f.size / 1024).toFixed(0)} KB`,
    }))
    dispatch({ type: "ADD_ATTACHMENTS", files: newAttachments })
    e.target.value = ""
  }, [])

  const removeAttachment = React.useCallback((index: number) => {
    dispatch({ type: "REMOVE_ATTACHMENT", index })
  }, [])

  const handleToInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      traceComposerInteraction("mail-composer.recipient-edit", "to-input", () => {
        dispatch({ type: "SET_TO_INPUT", value: e.target.value })
      })
    },
    [traceComposerInteraction],
  )

  const handleCcInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      traceComposerInteraction("mail-composer.recipient-edit", "cc-input", () => {
        dispatch({ type: "SET_CC_INPUT", value: e.target.value })
      })
    },
    [traceComposerInteraction],
  )

  const handleBccInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      traceComposerInteraction("mail-composer.recipient-edit", "bcc-input", () => {
        dispatch({ type: "SET_BCC_INPUT", value: e.target.value })
      })
    },
    [traceComposerInteraction],
  )

  const handleSubjectChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      traceComposerInteraction("mail-composer.typing", "subject", () => {
        dispatch({ type: "SET_SUBJECT", value: e.target.value })
      })
    },
    [traceComposerInteraction],
  )

  const handleBodyChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      traceComposerInteraction("mail-composer.typing", "body", () => {
        dispatch({ type: "SET_BODY", value: e.target.value })
      })
    },
    [traceComposerInteraction],
  )

  if (!open) return null

  return (
    <PerformanceProfiler id="mail-composer.surface">
      <div
      className={cn(
        "fixed z-50 flex flex-col rounded-xl border bg-background shadow-2xl transition-all",
        state.maximized
          ? "inset-4 rounded-xl"
          : state.minimized
            ? "bottom-0 right-6 h-12 w-120"
            : "bottom-6 right-6 h-130 w-120"
      )}
    >
      {/* Header */}
      <div
        className="flex h-12 shrink-0 cursor-pointer items-center justify-between rounded-t-xl bg-amber-400 px-4"
        onClick={() => state.minimized && dispatch({ type: "TOGGLE_MINIMIZED" })}
      >
        <span className="text-sm font-semibold text-amber-950">New Message</span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              dispatch({ type: "TOGGLE_MINIMIZED" })
            }}
            className="rounded p-1 text-amber-950 hover:bg-amber-500/50"
          >
            <MinusIcon className="size-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              dispatch({ type: "TOGGLE_MAXIMIZED" })
            }}
            className="rounded p-1 text-amber-950 hover:bg-amber-500/50"
          >
            {state.maximized ? (
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
      {!state.minimized && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* To field */}
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <span className="shrink-0 text-sm text-muted-foreground">To</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {state.recipients.map((r, i) => (
                <span
                  key={r.email}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                >
                  {r.name}
                  <button
                    onClick={() => removeRecipient("to", i)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={state.toInput}
                onChange={handleToInputChange}
                onKeyDown={(e) => handleKeyDown(e, "to")}
                onBlur={() => handleAddRecipient("to")}
                className="min-w-30 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder={state.recipients.length === 0 ? "Recipients" : ""}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!state.showCc && (
                <button
                  onClick={() => dispatch({ type: "SHOW_CC" })}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  CC
                </button>
              )}
              {!state.showBcc && (
                <button
                  onClick={() => dispatch({ type: "SHOW_BCC" })}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  BCC
                </button>
              )}
            </div>
          </div>

          {/* CC field */}
          {state.showCc && (
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <span className="shrink-0 text-sm text-muted-foreground">Cc</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {state.ccRecipients.map((r, i) => (
                  <span
                    key={r.email}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                  >
                    {r.name}
                    <button
                      onClick={() => removeRecipient("cc", i)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={state.ccInput}
                  onChange={handleCcInputChange}
                  onKeyDown={(e) => handleKeyDown(e, "cc")}
                  onBlur={() => handleAddRecipient("cc")}
                  className="min-w-30 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder=""
                />
              </div>
            </div>
          )}

          {/* BCC field */}
          {state.showBcc && (
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <span className="shrink-0 text-sm text-muted-foreground">Bcc</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {state.bccRecipients.map((r, i) => (
                  <span
                    key={r.email}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                  >
                    {r.name}
                    <button
                      onClick={() => removeRecipient("bcc", i)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={state.bccInput}
                  onChange={handleBccInputChange}
                  onKeyDown={(e) => handleKeyDown(e, "bcc")}
                  onBlur={() => handleAddRecipient("bcc")}
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
              value={state.subject}
              onChange={handleSubjectChange}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder=""
            />
          </div>

          {/* Text body */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <textarea
              value={state.body}
              onChange={handleBodyChange}
              className="size-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
              placeholder="Write your message..."
            />
          </div>

          {/* Attachments */}
          {state.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t px-4 py-2">
              {state.attachments.map((att, i) => (
                <div
                  key={att.name}
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
    </PerformanceProfiler>
  )
}
