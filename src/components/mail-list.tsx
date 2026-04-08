"use client"

import { useState } from "react"
import {
  ArchiveIcon,
  FolderIcon,
  Trash2Icon,
  PenSquareIcon,
  ChevronDownIcon,
  MoreHorizontalIcon,
} from "lucide-react"

import { cn } from "~/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { MailComposer } from "~/components/mail-composer"

export interface Mail {
  id: string
  sender: string
  email: string
  subject: string
  preview: string
  date: string
  read: boolean
  threadCount?: number
  avatar?: string
  avatarColor?: string
}

const mails: Mail[] = [
  {
    id: "1",
    sender: "Azie Melasari",
    email: "azie@example.com",
    subject: "Full Time UI Designer - Judha Maygustya",
    preview:
      "Dear Mrs Azie Melasari, I am Judha Maygustya, writing to express my interest in the Full Time UI Designer position at your company. I have over 5 years of experience in creating user-centered designs and would love the opportunity to contribute to your team.",
    date: "6:25PM",
    read: false,
    threadCount: 9,
    avatarColor: "bg-amber-500",
  },
  {
    id: "2",
    sender: "Emura Daily News",
    email: "news@emura.com",
    subject: "Emura Daily News - Latest Updates",
    preview:
      "Welcome to Emura Daily News! Here are the latest updates and highlights from this week. From product launches to community events, we have everything you need to stay informed about what is happening around Emura.",
    date: "6:25PM",
    read: false,
    avatar: "/avatars/emura.png",
    avatarColor: "bg-violet-600",
  },
  {
    id: "3",
    sender: "JAGO",
    email: "promo@jago.com",
    subject: "Glamping with a view get a DISCOUNT of 75 thousand?!",
    preview:
      "How are you, Hero? Looking for a healing place to escape the city buzz? We have an exclusive glamping experience with breathtaking mountain views, and right now you can get a massive discount of 75 thousand on your first booking!",
    date: "6:25PM",
    read: false,
    avatarColor: "bg-orange-500",
  },
  {
    id: "4",
    sender: "Zidane Nurabidin",
    email: "zidane@example.com",
    subject: "Let's Plan a Getaway!",
    preview:
      "I hope you're doing well! I was thinking it might be a great time for a little getaway. Maybe we could plan a weekend trip somewhere nice, like Bali or maybe the countryside. Let me know what you think and when you're free!",
    date: "Feb 20",
    read: false,
    avatarColor: "bg-emerald-500",
  },
  {
    id: "5",
    sender: "Robbi Darwis",
    email: "robbi@example.com",
    subject: "Happy Birthday!",
    preview:
      "I hope your special day is filled with happiness, good health, and everything that brings you joy. Wishing you a wonderful year ahead full of amazing adventures, great memories, and all the success you deserve. Happy Birthday!",
    date: "6:25PM",
    read: false,
    threadCount: 5,
    avatarColor: "bg-rose-500",
  },
  {
    id: "6",
    sender: "LinkedIn",
    email: "notifications@linkedin.com",
    subject: "Muhammad Royhan Darmawan and 13 others commented",
    preview:
      'Showcase porto" Hey everyone! 👋 I\'m excited to share my latest portfolio update featuring new case studies from recent client projects. Would love to hear your thoughts and feedback on the design direction I\'ve been exploring.',
    date: "Feb 19",
    read: true,
    avatar: "/avatars/linkedin.png",
    avatarColor: "bg-blue-700",
  },
  {
    id: "7",
    sender: "M. Rafi Irfansyah",
    email: "rafi@example.com",
    subject: "Long Time No Talk!",
    preview:
      "It's been a minute since we last caught up. Just wanted to check in and have a laid-back conversation about how things are going on your end. I've been working on some exciting new projects and would love to share the details with you over coffee sometime.",
    date: "Feb 18",
    read: true,
    avatarColor: "bg-indigo-500",
  },
  {
    id: "8",
    sender: "Muzaki Gurfon",
    email: "muzaki@example.com",
    subject: "Let's Catch Up!",
    preview:
      "Just thought I'd drop a message to catch up and chat a bit. It's been a while, and it would be great to hear what you've been up to lately. I recently moved to a new apartment and started a side project that I think you'd find really interesting.",
    date: "Feb 12",
    read: true,
    threadCount: 9,
    avatarColor: "bg-teal-600",
  },
  {
    id: "9",
    sender: "Google",
    email: "no-reply@google.com",
    subject: "Inquiry Regarding Google Services",
    preview:
      "I'm reaching out to inquire about some of the services and tools Google offers for small businesses. Specifically, I'm interested in Google Workspace, Cloud Platform pricing, and how to integrate Google Analytics with our existing marketing stack.",
    date: "Feb 8",
    read: true,
    avatar: "/avatars/google.png",
    avatarColor: "bg-gray-100",
  },
  {
    id: "10",
    sender: "Alfan Olivan",
    email: "alfan@example.com",
    subject: "Job Opportunity: Project Manager",
    preview:
      "I'm currently looking to hire a talented and experienced Project Manager to lead our growing team. The role involves managing cross-functional teams, overseeing product timelines, and ensuring delivery of high-quality digital products for our clients.",
    date: "Feb 6",
    read: true,
    threadCount: 9,
    avatarColor: "bg-purple-600",
  },
  {
    id: "11",
    sender: "Google",
    email: "no-reply@google.com",
    subject: "Security Alert: Action Required to Protect Your Account",
    preview:
      "We detected suspicious activity that may have compromised your account security. Someone attempted to sign in from an unrecognized device in a new location. Please review your recent activity and update your password immediately to protect your account.",
    date: "Feb 1",
    read: true,
    avatar: "/avatars/google.png",
    avatarColor: "bg-gray-100",
  },
  {
    id: "12",
    sender: "Faris Hadi Mulyo",
    email: "faris@example.com",
    subject: "Let's Collaborate on a Web Development Project!",
    preview:
      "I believe our combined skills could lead to something truly amazing. I have a web development project in mind that requires both strong frontend design and solid backend architecture. Would you be open to discussing a potential collaboration?",
    date: "Jan 29",
    read: true,
    threadCount: 5,
    avatarColor: "bg-pink-500",
  },
  {
    id: "13",
    sender: "Paypal",
    email: "service@paypal.com",
    subject: "You've received $1,430.00 USD from Emura Studio",
    preview:
      "Judha Maygustya, you received $1,430.00 USD from Emura Studio. The payment has been deposited into your PayPal balance. You can withdraw or transfer this amount to your linked bank account at any time.",
    date: "Jan 29",
    read: true,
    avatar: "/avatars/paypal.png",
    avatarColor: "bg-blue-600",
  },
  {
    id: "14",
    sender: "Ryan",
    email: "ryan@example.com",
    subject: "Inquiry About Design Fee",
    preview:
      "I wanted to inquire about the fee for a single design project with you. Could you share your rate card or provide an estimate for a landing page redesign? We're looking at a 2-week turnaround and have a clear brief ready to share.",
    date: "Jan 29",
    read: true,
    threadCount: 24,
    avatarColor: "bg-red-500",
  },
  {
    id: "15",
    sender: "Galang Andhika",
    email: "galang@example.com",
    subject: "Website Design Collaboration",
    preview:
      "I'm reaching out to explore the possibility of a design collaboration between our teams. We're building a new SaaS product and need help with the entire design system, from wireframes and prototyping all the way through to final UI implementation.",
    date: "Jan 26",
    read: true,
    avatarColor: "bg-green-600",
  },
  {
    id: "16",
    sender: "Paypal",
    email: "service@paypal.com",
    subject: "You've received $230.00 USD from Upwork",
    preview: "Judha Maygustya, you received $230.00 USD from Upwork. This payment is for your completed milestone on the Dashboard UI Design project. The funds are now available in your PayPal account and can be transferred at any time.",
    date: "Jan 24",
    read: true,
    avatar: "/avatars/paypal.png",
    avatarColor: "bg-blue-600",
  },
]

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function MailList() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [composerOpen, setComposerOpen] = useState(false)

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
    if (selected.size === mails.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(mails.map((m) => m.id)))
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-1">
          <Checkbox
            checked={
              selected.size === mails.length
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
        {mails.map((mail) => (
          <div
            key={mail.id}
            className={cn(
              "group flex items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/50",
              selected.has(mail.id) && "bg-muted/50"
            )}
          >
            <Checkbox
              checked={selected.has(mail.id)}
              onCheckedChange={() => toggleSelect(mail.id)}
              aria-label={`Select mail from ${mail.sender}`}
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
              {mail.avatar ? (
                <AvatarImage src={mail.avatar} alt={mail.sender} />
              ) : null}
              <AvatarFallback
                className={cn(
                  "text-xs font-semibold text-white rounded-lg",
                  mail.avatarColor ?? "bg-muted"
                )}
              >
                {getInitials(mail.sender)}
              </AvatarFallback>
            </Avatar>

            {/* Content */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-3">
              <div className="flex min-w-0 items-center justify-between gap-2 md:w-44 md:shrink-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-sm",
                      !mail.read ? "font-semibold text-foreground" : "text-foreground"
                    )}
                  >
                    {mail.sender}
                  </span>
                  {mail.threadCount && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      me ({mail.threadCount})
                    </span>
                  )}
                </div>
                {/* Date on mobile */}
                <span className="shrink-0 text-xs text-muted-foreground md:hidden">
                  {mail.date}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <span
                    className={cn(
                        "shrink-0 truncate text-sm max-w-[50%]",
                        !mail.read ? "font-semibold text-foreground" : "text-foreground"
                    )}
                >
                    {mail.subject}
                </span>
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                    - {mail.preview}
                </span>
              </div>

              {/* Date on desktop */}
              <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
                {mail.date}
              </span>
            </div>
          </div>
        ))}
      </div>

      <MailComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
    </div>
  )
}
