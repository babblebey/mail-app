---
title: "Mail Caching & Background Sync"
status: in-progress
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Offline support noted as future consideration"
  - type: prd
    url: .project/prds/003-imap-fetch-folders-and-messages/prd.md
    description: "Prior PRD — IMAP fetch folders & messages (completed)"
  - type: prd
    url: .project/prds/009-attachment-downloads-preview/prd.md
    description: "Prior PRD — Attachment downloads & preview (completed)"
  - type: prd
    url: .project/prds/012-thread-view-toolbar-actions/prd.md
    description: "Prior PRD — Thread view toolbar actions (completed)"
  - type: prd
    url: .project/prds/013-mail-list-context-menu/prd.md
    description: "Prior PRD — Mail list context menu (completed)"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Mail Caching & Background Sync

## Description

Currently every navigation action (listing folders, browsing messages, opening a thread) hits the IMAP server live. This introduces noticeable latency — especially for folders with many messages — and makes the UI feel sluggish compared to modern mail clients.

This PRD introduces a **local caching layer** backed by PostgreSQL and a **standalone background sync worker** that polls IMAP every 30 seconds. Once in place, the tRPC API reads from the local cache for instant navigation, falling back to a live IMAP fetch only on cache misses. The IMAP server remains the authoritative source of truth; the database acts as a read-through cache with continuous background refresh.

### Design Decisions

- **Hybrid body caching**: The 50 most recent messages per folder have their bodies eagerly fetched during sync. Older messages are fetched lazily on first open and then cached. This balances storage efficiency with instant navigation for the most-accessed messages.
- **Attachments stay live**: Attachment binary data is **not** cached. The existing `/api/attachments` route continues to fetch from IMAP on demand, avoiding database bloat.
- **UIDVALIDITY for cache invalidation**: If the IMAP server reports a different UIDVALIDITY for a mailbox, the entire folder cache is purged and rebuilt from scratch — this is the IMAP-correct approach to guarantee UID consistency.
- **Standalone worker process**: The sync engine runs as a separate Node.js process (`tsx src/server/sync/index.ts`), not inside Next.js API routes. This avoids serverless timeout constraints, allows continuous polling, and keeps the web server responsive.
- **Sequential account processing**: The worker processes accounts one at a time to avoid IMAP connection storms. With a 30-second interval this provides acceptable freshness for typical use.
- **Deletion detection window**: To avoid expensive full-UID comparisons on large folders, deletion detection is limited to the most recent 200 messages per folder.

### User Stories

- **As a** logged-in user, **I want** folders and messages to load instantly when I navigate, **so that** the app feels as fast as a native mail client.
- **As a** logged-in user, **I want** new messages to appear in my inbox within 30 seconds of arrival, **so that** I stay up to date without manually refreshing.
- **As a** logged-in user, **I want** flag changes I make (read/unread, starred) to persist even if the sync worker hasn't caught up yet, **so that** my actions feel immediate.
- **As a** logged-in user, **I want** to open a recently received message and see its full body instantly, **so that** I don't wait for a live IMAP download.
- **As a** logged-in user, **I want** to open an older message and still see its content (fetched on demand), **so that** the cache doesn't prevent me from reading any mail.

## Implementation Plan

### Phase 1: Database Schema

**Goal:** Define the Prisma models for caching mail folders, message metadata, message bodies, and per-account sync state.

#### Tasks

- [x] Add `MailFolder` model to `prisma/schema.prisma`:
  - Fields: `id` (cuid PK), `mailAccountId` (FK → MailAccount), `path` (IMAP path e.g. `"INBOX"`), `name` (display name), `specialUse` (optional, e.g. `"\\Inbox"`), `delimiter` (optional), `totalMessages` (Int, default 0), `unseenMessages` (Int, default 0), `uidValidity` (Int, optional — IMAP UIDVALIDITY), `highestUid` (Int, default 0 — highest synced UID for incremental fetch), `lastSyncedAt` (DateTime, optional)
  - Unique constraint: `[mailAccountId, path]`
  - Relation: belongs to `MailAccount`
- [x] Add `MailMessage` model to `prisma/schema.prisma`:
  - Fields: `id` (cuid PK), `mailAccountId` (FK → MailAccount), `folderId` (FK → MailFolder), `uid` (Int — IMAP UID), `messageId` (String, optional — Message-ID header), `subject` (String, optional), `fromAddress` (Json — array of `{name, address}`), `toAddress` (Json), `ccAddress` (Json, optional), `bccAddress` (Json, optional), `date` (DateTime, optional), `flags` (String array), `read` (Boolean, default false), `starred` (Boolean, default false), `snippet` (String, optional — first ~120 chars), `hasAttachments` (Boolean, default false), `inReplyTo` (String, optional), `references` (String array), `bodyFetched` (Boolean, default false), `createdAt` (DateTime), `updatedAt` (DateTime)
  - Unique constraint: `[folderId, uid]`
  - Indexes: `[mailAccountId]`, `[folderId, date DESC]` (for ordered pagination)
  - Relations: belongs to `MailAccount`, belongs to `MailFolder`, has one `MailMessageBody`
- [x] Add `MailMessageBody` model to `prisma/schema.prisma`:
  - Fields: `id` (cuid PK), `messageId` (String, unique FK → MailMessage.id), `textBody` (String, optional), `htmlBody` (String, optional), `attachments` (Json, optional — metadata array: filename, contentType, size, cid, index), `fetchedAt` (DateTime, default now)
  - Relation: belongs to `MailMessage` (1:1)
- [x] Add `SyncState` model to `prisma/schema.prisma`:
  - Fields: `id` (cuid PK), `mailAccountId` (String, unique FK → MailAccount), `status` (String, default `"idle"` — one of `"idle"`, `"syncing"`, `"error"`), `error` (String, optional), `lastSyncStartedAt` (DateTime, optional), `lastSyncCompletedAt` (DateTime, optional)
  - Relation: belongs to `MailAccount` (1:1)
- [x] Add corresponding relation fields on the `MailAccount` model (`folders`, `messages`, `syncState`)
- [x] Run `prisma migrate dev --name mail-caching` to generate and apply the migration
- [x] Verify the generated client types include the new models

### Phase 2: Sync Engine — Folder Sync

**Goal:** Create a module that synchronises the IMAP mailbox list into the `MailFolder` table, detecting additions, updates, and deletions.

#### Tasks

- [ ] Create `src/server/sync/folder-sync.ts` exporting a `syncFolders(accountId: string)` function:
  - Open an IMAP connection using the existing `createImapClient` + credential decryption pattern from `src/server/imap/client.ts`
  - Call `client.list()` to retrieve all mailboxes
  - For each mailbox:
    - Open the mailbox read-only to get `status.messages` (total) and `status.unseen` (unseen count), plus `uidValidity`
    - Upsert a `MailFolder` record matched by `[mailAccountId, path]`
    - Update `totalMessages`, `unseenMessages`, `uidValidity`, `specialUse`, `name`, `delimiter`, `lastSyncedAt`
  - Detect deleted folders: query all `MailFolder` records for this account, delete any whose `path` no longer appears in the IMAP listing (cascade deletes their cached messages)
  - Return the list of synced `MailFolder` records (needed by the message sync step)

### Phase 3: Sync Engine — Message Metadata Sync

**Goal:** Incrementally sync message metadata (envelope, flags) into the `MailMessage` table for each folder.

#### Tasks

- [ ] Create `src/server/sync/message-sync.ts` exporting a `syncMessages(client: ImapFlow, folder: MailFolder)` function:
  - Open the mailbox read-only
  - **UIDVALIDITY check**: Compare the IMAP mailbox's `uidValidity` with the stored `folder.uidValidity`
    - If they differ: delete all `MailMessage` records for this folder, reset `highestUid` to 0, update stored `uidValidity` — then proceed as a full sync
  - **New messages**: Fetch messages with `UID > folder.highestUid` using `client.fetch()` with `{ envelope: true, flags: true, uid: true, bodyStructure: true }`
    - For each message: create a `MailMessage` record with uid, subject, from/to/cc/bcc (from envelope), date, flags, read (`\\Seen`), starred (`\\Flagged`), hasAttachments (using existing `hasAttachments()` helper), snippet (fetch the snippet part as done in current `listMessages`)
    - Update `folder.highestUid` to the max UID seen
  - **Flag refresh on recent messages**: For the most recent 200 messages (by UID descending), re-fetch flags only (`client.fetch(range, { flags: true, uid: true })`)
    - Update `read` and `starred` fields, plus the raw `flags` array, for any changed messages
  - **Deletion detection**: For the same recent-200 window, collect UIDs from IMAP and compare with cached UIDs
    - Delete any `MailMessage` records whose UID is no longer present on the server
  - Update `folder.lastSyncedAt`

### Phase 4: Sync Engine — Body Sync (Eager)

**Goal:** Eagerly download and cache full message bodies for the most recent unfetched messages in each folder.

#### Tasks

- [ ] Create `src/server/sync/body-sync.ts` exporting a `syncBodies(client: ImapFlow, folder: MailFolder)` function:
  - Query `MailMessage` records for this folder where `bodyFetched = false`, ordered by `date DESC`, limited to 50
  - For each message:
    - Download the full RFC822 source via `client.download(uid, undefined, { uid: true })`
    - Parse with `simpleParser` from `mailparser`
    - Extract `textBody`, `htmlBody` (sanitised using the same `sanitize-html` configuration from the current `getMessage` procedure), and attachment metadata (filename, contentType, size, cid, index)
    - Create a `MailMessageBody` record linked to the `MailMessage`
    - Set `bodyFetched = true` on the `MailMessage` record
  - Handle individual message failures gracefully (log and continue to next message)

### Phase 5: Sync Engine — Worker Loop

**Goal:** Create the main worker process that orchestrates continuous sync across all mail accounts.

#### Tasks

- [ ] Create `src/server/sync/worker.ts` exporting a `startSyncWorker()` function:
  - On startup: for each `MailAccount` in the database, ensure a `SyncState` record exists (create with status `"idle"` if missing)
  - Main loop (runs indefinitely):
    1. Query all `MailAccount` records (with their `SyncState`)
    2. For each account (sequentially):
       - Set `SyncState.status = "syncing"`, `lastSyncStartedAt = now()`
       - Open one IMAP connection for the account
       - Run `syncFolders(accountId)` → returns folder list
       - For each folder: run `syncMessages(client, folder)` then `syncBodies(client, folder)`
       - Close the IMAP connection
       - Set `SyncState.status = "idle"`, `lastSyncCompletedAt = now()`, clear `error`
       - On error: set `SyncState.status = "error"`, store error message, log the error, and continue to the next account
    3. Wait 30 seconds, then repeat
  - Handle graceful shutdown on `SIGINT` / `SIGTERM` (finish current account, then exit)
- [ ] Create `src/server/sync/index.ts` as the entry point:
  - Load environment variables (so `DATABASE_URL` and encryption keys are available)
  - Import and call `startSyncWorker()`
  - Log startup and shutdown messages
- [ ] Add a `"sync"` script to `package.json`: `"sync": "tsx src/server/sync/index.ts"`

### Phase 6: API — Read From Cache

**Goal:** Refactor the `mail` tRPC router so that read queries (`listFolders`, `listMessages`, `getMessage`) serve data from the local cache, falling back to live IMAP only when the cache is empty or missing.

#### Tasks

- [ ] Refactor `mail.listFolders`:
  - Query `MailFolder` records from the database for the resolved account, sorted by special-use priority (same ordering as current IMAP implementation), then alphabetically
  - Map to the same response shape: `{ path, name, specialUse, delimiter, totalMessages, unseenMessages }`
  - **Fallback**: If no `MailFolder` records exist for the account (first load before sync has run), fall back to the current live IMAP fetch — but do **not** persist results (let the worker handle that)
- [ ] Refactor `mail.listMessages`:
  - Query `MailMessage` records from the database for the resolved account + folder path
  - Paginate by `date DESC` using a date-based cursor (ISO string) instead of IMAP sequence numbers
  - Return `{ messages[], nextCursor }` with the same message summary shape the frontend expects: `{ uid, subject, from, to, cc, bcc, date, flags, read, starred, snippet, hasAttachments }`
  - **Fallback**: If the folder has no cached messages, fall back to the current live IMAP fetch
- [ ] Refactor `mail.getMessage`:
  - Look up the `MailMessage` + `MailMessageBody` from the database by folder path + UID
  - If `MailMessageBody` exists: return cached data (textBody, htmlBody, attachments) mapped to the same response shape
  - If `MailMessageBody` does not exist (lazy path): execute the current live IMAP fetch, **then** persist the result to `MailMessageBody`, set `bodyFetched = true`, and return
  - Preserve the existing auto-mark-as-read behavior (update both IMAP and local cache)
  - Preserve the existing HTML sanitisation, CID-to-URL replacement, and attachment processing

### Phase 7: API — Write-Through Mutations

**Goal:** Update all mutation procedures to apply changes to both the IMAP server and the local cache atomically, so the UI reflects changes instantly without waiting for the next sync cycle.

#### Tasks

- [ ] Update `mail.markAsRead`:
  - After successfully updating IMAP flags: update the corresponding `MailMessage` record's `read` field and `flags` array
- [ ] Update `mail.toggleStar`:
  - After successfully updating IMAP flags: update the corresponding `MailMessage` record's `starred` field and `flags` array
- [ ] Update `mail.moveMessage`:
  - After successfully moving on IMAP: delete the `MailMessage` record from the source folder's cache (the message will appear in the destination folder on the next sync cycle)
- [ ] Update `mail.batchMarkAsRead`:
  - After successfully updating IMAP: batch-update `MailMessage` records for all affected UIDs
- [ ] Update `mail.batchMoveMessages`:
  - After successfully moving on IMAP: batch-delete `MailMessage` records for all affected UIDs from the source folder

### Phase 8: API — Sync Status & Manual Trigger

**Goal:** Expose sync state to the frontend and allow users to manually request an immediate sync.

#### Tasks

- [ ] Add `mail.getSyncStatus` query:
  - Input: `{ accountId?: string }`
  - Returns the `SyncState` record for the resolved account: `{ status, error, lastSyncStartedAt, lastSyncCompletedAt }`
- [ ] Add `mail.triggerSync` mutation:
  - Input: `{ accountId?: string }`
  - Sets `SyncState.status` to `"pending"` (a new transient state the worker checks)
  - The worker, on each iteration, processes `"pending"` accounts first before applying the 30-second wait
  - Returns `{ ok: true }`

## Acceptance Criteria

- [ ] Four new Prisma models (`MailFolder`, `MailMessage`, `MailMessageBody`, `SyncState`) exist and the migration applies cleanly
- [ ] Running `pnpm sync` starts the background worker, which logs sync activity and processes all mail accounts on a 30-second interval
- [ ] `mail.listFolders` returns cached folder data from the database (no IMAP round-trip after first sync)
- [ ] `mail.listMessages` returns cached message summaries with date-cursor pagination (no IMAP round-trip after first sync)
- [ ] `mail.getMessage` returns cached body for recently synced messages instantly; for uncached messages it fetches from IMAP, caches, and returns
- [ ] Flag mutations (`markAsRead`, `toggleStar`) update both IMAP and the local `MailMessage` record
- [ ] Move mutations (`moveMessage`, `batchMoveMessages`) update IMAP and remove the message from the source folder cache
- [ ] A UIDVALIDITY change on the IMAP server triggers a full folder cache purge and rebuild on the next sync cycle
- [ ] The sync worker handles account-level errors gracefully (logs, records in `SyncState`, continues to next account)
- [ ] The sync worker shuts down cleanly on SIGINT/SIGTERM
- [ ] The existing frontend components (`mail-list`, `mail-thread`, `app-sidebar`) continue to work without modification — the API response shapes are preserved
- [ ] Attachment downloads continue to work via the live IMAP `/api/attachments` route (not cached)
- [ ] No TypeScript or lint errors after all changes
