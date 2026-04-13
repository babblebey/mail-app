# Mail App — Project Brief

## Overview

A web-based mail client built with Next.js that connects to mail servers via IMAP and SMTP, providing a clean interface for reading and composing emails. The app introduces a **gatekeeping** system that filters incoming mail by sender trust level, surfacing trusted messages immediately and holding unclassified ones for review.

## Core Features

### 1. IMAP Email Retrieval

- Connect to any IMAP-compatible mail server using user-provided credentials (host, port, username, password).
- Fetch mailbox folders (Inbox, Sent, Drafts, Trash, etc.) and list messages with metadata (subject, sender, date, read/unread status).
- Retrieve full message content including plain text, HTML bodies, and attachments.
- Support idle/push for real-time new mail notifications where the server allows.
- Handle pagination and on-demand loading for large mailboxes.

### 2. SMTP Email Sending

- Connect to an SMTP server using user-provided credentials.
- Compose and send plain text and HTML emails.
- Support To, CC, BCC, and Reply-To fields.
- Attach files to outgoing messages.
- Save drafts locally and to the server Drafts folder via IMAP.
- Support reply, reply-all, and forward actions on existing messages.

### 3. Gatekeeping (Sender Trust & Classification) — *Future*

- Maintain a **trusted senders** list per user account.
- Incoming mail from trusted senders appears in the primary inbox as normal.
- Mail from unknown or uncategorized senders is held in a separate **Review Queue**.
- Users can review held messages and take action:
  - **Trust** — add the sender to the trusted list; current and future mail flows to the inbox.
  - **Block** — reject the sender; current and future mail is auto-discarded or moved to spam.
  - **Ignore** — leave the message in the queue without classifying the sender.
- Provide bulk actions for classifying multiple held messages at once.

## Future Considerations

The following are out of scope for the initial build but noted for later phases:

- **Multi-account support** — manage multiple mail accounts from a single interface.
- **Full-text search** — index and search message bodies and attachments.
- **Labels / Tags** — user-defined categorisation beyond folders.
- **Rules & Filters** — automated actions based on sender, subject, or content patterns.
- **Encryption** — PGP/GPG signing and encryption of messages.
- **Calendar & Contacts integration** — pull contact info and calendar invites from messages.
- **Offline support** — cache messages locally for offline reading.
- **OAuth authentication** — support Gmail, Outlook, and other OAuth-based providers.

## Tech Stack

| Layer       | Technology                        |
| ----------- | --------------------------------- |
| Framework   | Next.js (App Router)              |
| Language    | TypeScript                        |
| Database    | PostgreSQL + Prisma ORM           |
| API         | tRPC                              |
| Auth        | NextAuth.js                       |
| UI          | shadcn/ui + Tailwind CSS          |
| IMAP Client | TBD (e.g. `imapflow`)            |
| SMTP Client | TBD (e.g. `nodemailer`)          |

## Initial Milestone

Deliver a working app where a user can:

1. Add their mail server credentials (IMAP + SMTP).
2. Browse mailbox folders and read emails.
3. Compose and send a new email (with reply/forward).
4. See a functional UI with sidebar navigation, message list, and thread view.

Gatekeeping, multi-account, and all other future features are **deferred** and will not be part of this milestone.
