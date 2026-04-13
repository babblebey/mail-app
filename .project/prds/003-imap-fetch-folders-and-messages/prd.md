---
title: "IMAP: Fetch Folders & Messages"
status: in-progress
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
  - type: prd
    url: .project/prds/001-mail-account-credentials/prd.md
    description: "Prior PRD — Mail account credentials & data model (completed)"
  - type: prd
    url: .project/prds/002-route-protection-login-page/prd.md
    description: "Prior PRD — Route protection & custom login page (completed)"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# IMAP: Fetch Folders & Messages

## Description

The app can now store and manage mail account credentials (PRD-001) and protect routes behind authentication (PRD-002). The next step is to **connect to the user's IMAP server** and provide real mailbox data to the UI — replacing the hardcoded sample data that currently powers the sidebar, mail list, and thread view.

This PRD covers:

1. Installing and configuring an IMAP client library.
2. Building a server-side IMAP service that manages connections and exposes mailbox operations.
3. Creating tRPC procedures for listing folders, listing messages, and fetching a single message.
4. Wiring the existing UI components to consume live IMAP data.

### Design Decisions

- **`imapflow` as the IMAP library**: It provides a modern, Promise-based API with built-in IDLE support, BODYSTRUCTURE parsing, and good TypeScript compatibility. It is actively maintained and handles connection lifecycle well.
- **No local message cache (yet)**: Messages are fetched directly from the IMAP server on each request. Local caching/sync is deferred to a future PRD to keep this scope focused.
- **Connection-per-request**: Each tRPC call opens a short-lived IMAP connection, performs the operation, and disconnects. Connection pooling is a future optimisation.
- **HTML sanitisation**: Message bodies may contain arbitrary HTML. All HTML content must be sanitised server-side before being sent to the client to prevent XSS.

### User Stories

- **As a** logged-in user, **I want** to see my real mailbox folders in the sidebar, **so that** I can navigate my email the same way I do in other clients.
- **As a** logged-in user, **I want** to see a list of messages when I click on a folder, **so that** I can find and read my emails.
- **As a** logged-in user, **I want** to open a message and read its full content (text and HTML), **so that** I can understand the email.
- **As a** logged-in user, **I want** to see message metadata (sender, date, subject, read/unread), **so that** I can quickly scan my inbox.
- **As a** logged-in user, **I want** to messages to load in pages, **so that** large mailboxes don't freeze the interface.

## Implementation Plan

### Phase 1: Install Dependencies & Create IMAP Service

**Goal:** Establish the foundational server-side module that connects to an IMAP server using stored credentials and exposes reusable operations.

#### Tasks

- [x] Install `imapflow` — `pnpm add imapflow`
- [x] Install `@types/imapflow` or add a type declaration file if community types are unavailable
- [x] Install `mailparser` (for parsing raw message content into structured parts) — `pnpm add mailparser` and `pnpm add -D @types/mailparser`
- [x] Install an HTML sanitisation library (e.g. `sanitize-html`) — `pnpm add sanitize-html` and `pnpm add -D @types/sanitize-html`
- [x] Create `src/server/imap/client.ts` — a helper module that:
  - Accepts a `MailAccount` (or its decrypted credential subset) and returns a connected `ImapFlow` instance
  - Decrypts the stored password using `decrypt()` from `~/lib/crypto`
  - Configures TLS settings from the account's `imapTls` / `imapPort` fields
  - Exposes a `withImapClient(accountId, userId, callback)` wrapper that:
    1. Fetches the `MailAccount` from the database (verifying ownership)
    2. Opens a connection
    3. Passes the connected client to `callback`
    4. Ensures `client.logout()` is called in a `finally` block, even on error
- [x] Add logging for connection open/close and errors to aid debugging

### Phase 2: tRPC Router — Mail Folders

**Goal:** Expose a procedure that lists the user's IMAP mailbox folders (Inbox, Sent, Drafts, Trash, etc.) with metadata.

#### Tasks

- [x] Create `src/server/api/routers/mail.ts` with a `mail` router
- [x] Add a `listFolders` protected procedure:
  - Input: `{ accountId?: string }` (optional — falls back to the user's default account)
  - Uses `withImapClient` to connect and call `client.list()`
  - Maps the IMAP folder list to a response shape:
    ```ts
    {
      path: string          // e.g. "INBOX", "Sent", "[Gmail]/Drafts"
      name: string          // display name
      specialUse?: string   // e.g. "\\Inbox", "\\Sent", "\\Trash", "\\Drafts", "\\Junk"
      delimiter: string     // hierarchy separator
      listed: boolean
      subscribed: boolean
      totalMessages?: number
      unseenMessages?: number
    }
    ```
  - Sorts folders with well-known special-use folders first (Inbox, Drafts, Sent, Spam/Junk, Trash, Archive), then remaining folders alphabetically
- [x] Register the `mail` router in `src/server/api/root.ts`

### Phase 3: tRPC Router — List Messages in a Folder

**Goal:** Expose a procedure that returns a paginated list of message summaries for a given folder.

#### Tasks

- [x] Add a `listMessages` protected procedure to the `mail` router:
  - Input:
    ```ts
    {
      accountId?: string    // optional, defaults to user's default account
      folder: string        // folder path, e.g. "INBOX"
      cursor?: number       // sequence number to paginate from (descending)
      limit?: number        // default 50, max 100
    }
    ```
  - Opens the mailbox with `client.mailboxOpen(folder, { readOnly: true })`
  - Fetches message envelopes via `client.fetch()` with `{ envelope: true, flags: true, uid: true, bodyStructure: true }` over the requested range (newest-first)
  - Maps each message to:
    ```ts
    {
      uid: number
      sequenceNumber: number
      subject: string
      from: { name: string; address: string }
      to: { name: string; address: string }[]
      date: string              // ISO 8601
      flags: string[]           // e.g. ["\\Seen", "\\Flagged"]
      read: boolean             // derived from \\Seen flag
      starred: boolean          // derived from \\Flagged flag
      snippet: string           // first ~120 chars of plain-text body
      hasAttachments: boolean   // derived from bodyStructure
    }
    ```
  - Returns `{ messages: [...], nextCursor: number | null }` for cursor-based pagination
- [x] Handle empty folders gracefully (return `{ messages: [], nextCursor: null }`)

### Phase 4: tRPC Router — Fetch Single Message

**Goal:** Expose a procedure that retrieves the full content of a single email by UID.

#### Tasks

- [x] Add a `getMessage` protected procedure to the `mail` router:
  - Input: `{ accountId?: string, folder: string, uid: number }`
  - Opens the mailbox and fetches the full message source via `client.fetchOne()` or `client.download()`
  - Parses the raw message using `mailparser`'s `simpleParser` to extract:
    ```ts
    {
      uid: number
      messageId: string
      subject: string
      from: { name: string; address: string }
      to: { name: string; address: string }[]
      cc: { name: string; address: string }[]
      bcc: { name: string; address: string }[]
      replyTo: { name: string; address: string }[]
      date: string              // ISO 8601
      flags: string[]
      read: boolean
      starred: boolean
      textBody: string | null
      htmlBody: string | null   // sanitised HTML
      attachments: {
        filename: string
        contentType: string
        size: number
        cid?: string            // for inline images
      }[]
      inReplyTo?: string        // message-id of parent (for threading)
      references?: string[]     // message-id chain (for threading)
    }
    ```
  - Sanitise `htmlBody` server-side using `sanitize-html` before returning to client
  - Auto-mark the message as `\\Seen` on the server (via `client.messageFlagsAdd`) unless already read
- [x] Add a `markAsRead` / `markAsUnread` protected procedure:
  - Input: `{ accountId?: string, folder: string, uid: number, read: boolean }`
  - Adds or removes the `\\Seen` flag on the IMAP server
- [x] Add a `toggleStar` protected procedure:
  - Input: `{ accountId?: string, folder: string, uid: number, starred: boolean }`
  - Adds or removes the `\\Flagged` flag on the IMAP server

### Phase 5: Wire UI — Sidebar Folders

**Goal:** Replace the hardcoded folder list in the sidebar with live data from the IMAP server.

#### Tasks

- [x] Update `src/components/app-sidebar.tsx`:
  - Call `api.mail.listFolders.useQuery()` on the user's default account
  - Map the folder response into the existing `navMain` structure, preserving the icon mapping for special-use folders (Inbox → `InboxIcon`, Sent → `SendIcon`, Drafts → `FileTextIcon`, Spam → `AlertOctagonIcon`, Trash → `Trash2Icon`, Archive → `ArchiveIcon`)
  - Show folder unread count badges where `unseenMessages > 0`
  - Show a skeleton/loading state while folders are being fetched
  - Handle errors (e.g. connection failure) with a non-blocking inline error message and a retry action
- [x] Clicking a folder navigates to `/dashboard?folder=<path>` (or updates a query param / client-side state) so the mail list knows which folder to display
- [x] Default to the Inbox folder on initial load

### Phase 6: Wire UI — Mail List

**Goal:** Replace the hardcoded message list with live data from the selected IMAP folder.

#### Tasks

- [ ] Update `src/components/mail-list.tsx`:
  - Accept a `folder` prop (or read it from the URL / search params)
  - Call `api.mail.listMessages.useInfiniteQuery()` with cursor-based pagination
  - Replace the hardcoded `mails` array with the query results
  - Map the API response to the existing `Mail` interface (adapt the interface if needed)
  - Implement "load more" or infinite scroll at the bottom of the list to fetch the next page
  - Show a skeleton/loading state for the initial load
  - Show an empty state when the folder has no messages
  - Handle errors with an inline error message and retry
- [ ] Clicking a message navigates to `/dashboard/mail/[uid]?folder=<path>` (or equivalent route)
- [ ] Reflect read/unread state visually (bold text for unread, as currently styled)
- [ ] Reflect starred/flagged state visually

### Phase 7: Wire UI — Thread / Message View

**Goal:** Replace the hardcoded `sampleThread` in the thread view with full message content fetched from the IMAP server.

#### Tasks

- [ ] Update `src/components/mail-thread.tsx`:
  - Accept `uid` and `folder` as props (derived from the route params)
  - Call `api.mail.getMessage.useQuery({ folder, uid })` to fetch the full message
  - Replace `sampleThread` and its `ThreadMessage[]` with real data
  - Render `htmlBody` safely inside a sandboxed container (e.g. an `<iframe>` with `srcdoc` and `sandbox` attributes, or a `<div>` with the already-sanitised HTML via `dangerouslySetInnerHTML`)
  - Fall back to `textBody` rendered as `whitespace-pre-line` if `htmlBody` is null
  - Display attachment metadata (filename, size, type) as a list — actual download is deferred to a future PRD
  - Show a loading skeleton while the message is being fetched
  - Handle fetch errors gracefully
- [ ] Update `src/app/dashboard/mail/[id]/page.tsx` to extract `uid` and `folder` from params/searchParams and pass them to `MailThreadView`
- [ ] Auto-mark the message as read when opened (the `getMessage` procedure handles this server-side)

### Phase 8: Replace testConnection Stub

**Goal:** Replace the placeholder `testConnection` procedure in the mail-account router with a real IMAP connection test.

#### Tasks

- [ ] Update `mailAccount.testConnection` in `src/server/api/routers/mail-account.ts`:
  - Use the IMAP client helper from Phase 1 to attempt a real connection with the provided credentials
  - Connect, authenticate, and immediately logout
  - Return `{ ok: true }` on success, or throw a `TRPCError` with a descriptive message on failure (bad credentials, unreachable host, TLS error, etc.)
- [ ] Ensure the existing "Test Connection" button in the settings UI reflects real success/failure

## Acceptance Criteria

- [ ] `imapflow` and `mailparser` are installed and usable in the server-side codebase
- [ ] `src/server/imap/client.ts` exists and provides a `withImapClient` helper that opens and safely closes connections
- [ ] The `mail.listFolders` procedure returns the authenticated user's real IMAP folders, sorted with special-use folders first
- [ ] The `mail.listMessages` procedure returns paginated message summaries (newest-first) for a given folder
- [ ] The `mail.getMessage` procedure returns the full parsed and sanitised content of a single email
- [ ] Flag mutations (`markAsRead`, `markAsUnread`, `toggleStar`) update flags on the IMAP server
- [ ] The sidebar displays real folders from the user's mail account with correct icons and unread counts
- [ ] The mail list displays real messages from the selected folder with pagination (infinite scroll or load-more)
- [ ] The thread view renders the full message content (HTML sanitised, or plain-text fallback)
- [ ] All HTML message bodies are sanitised server-side before being sent to the client (no raw HTML reaches the browser)
- [ ] The `testConnection` stub is replaced with a real IMAP connection attempt
- [ ] Loading and error states are handled in all three UI components (sidebar, list, thread)
- [ ] No TypeScript or lint errors after all changes
- [ ] All procedures are `protectedProcedure` and scoped to accounts owned by the current user
