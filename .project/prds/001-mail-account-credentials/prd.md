---
title: "Mail Account Credentials & Data Model"
status: draft
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Mail Account Credentials & Data Model

## Description

Before the app can fetch or send any email it needs to know **how to connect** to the user's mail server. This PRD covers the data model, server-side logic, and UI required for a logged-in user to add, view, edit, and remove their IMAP/SMTP credentials. It also cleans up the scaffold `Post` model that shipped with the T3 starter.

### User Stories

- **As a** logged-in user, **I want** to add my mail server credentials (IMAP & SMTP), **so that** the app can connect to my mailbox on my behalf.
- **As a** logged-in user, **I want** to see a list of mail accounts I've connected, **so that** I know which accounts are configured.
- **As a** logged-in user, **I want** to edit my mail account credentials, **so that** I can update them if my password or server details change.
- **As a** logged-in user, **I want** to delete a mail account, **so that** I can remove accounts I no longer use.
- **As a** logged-in user, **I want** to test my connection before saving, **so that** I know the credentials are correct.
- **As a** logged-in user, **I want** my passwords stored securely, **so that** they cannot be read in plain text from the database.

## Implementation Plan

### Phase 1: Data Model

**Goal:** Replace the scaffold `Post` model with a `MailAccount` model that stores per-user IMAP and SMTP credentials.

#### Tasks

- [ ] Remove the `Post` model from `prisma/schema.prisma` and delete `src/server/api/routers/post.ts`
- [ ] Remove the `post` router from `src/server/api/root.ts` and any references in `src/app/_components/post.tsx`
- [ ] Add a `MailAccount` model to `prisma/schema.prisma` with the following fields:
  ```
  model MailAccount {
      id        String   @id @default(cuid())
      label     String          // user-friendly display name, e.g. "Work Gmail"
      email     String          // full email address

      // IMAP
      imapHost  String
      imapPort  Int             @default(993)
      imapTls   Boolean         @default(true)

      // SMTP
      smtpHost  String
      smtpPort  Int             @default(587)
      smtpTls   Boolean         @default(true)

      // Auth (shared for IMAP & SMTP unless we need to split later)
      username  String          // login username (often same as email)
      password  String          // encrypted at application level

      isDefault Boolean  @default(false)  // the account shown on app load

      createdAt DateTime @default(now())
      updatedAt DateTime @updatedAt

      user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
      userId    String

      @@index([userId])
  }
  ```
- [ ] Add the `mailAccounts MailAccount[]` relation to the `User` model
- [ ] Generate and apply the Prisma migration (`pnpm db:generate`)

### Phase 2: Credential Encryption Utility

**Goal:** Ensure mail passwords are never stored in plain text.

#### Tasks

- [ ] Add an `ENCRYPTION_KEY` environment variable (32-byte hex string) to `.env` and validate it via `src/env.js` using `@t3-oss/env-nextjs`
- [ ] Create `src/lib/crypto.ts` exporting `encrypt(plaintext: string): string` and `decrypt(ciphertext: string): string` using Node.js `crypto` module with AES-256-GCM (IV + auth tag stored alongside the ciphertext)
- [ ] Write unit tests for encrypt/decrypt round-trip

### Phase 3: tRPC Router

**Goal:** Expose CRUD operations for mail accounts behind authenticated procedures.

#### Tasks

- [ ] Create `src/server/api/routers/mail-account.ts` with the following procedures:
  - `create` — validates input with Zod, encrypts the password, inserts a `MailAccount`
  - `list` — returns all accounts for the current user (password field excluded from response)
  - `getById` — returns a single account (password excluded)
  - `update` — updates account fields; re-encrypts password if changed
  - `delete` — removes an account by ID (must belong to current user)
  - `testConnection` — accepts credentials (not yet saved), attempts an IMAP login, and returns success/failure. Uses `imapflow` (installed in a later milestone); for now stub with a placeholder that validates input shape and returns `{ ok: true }` 
- [ ] Register the `mailAccount` router in `src/server/api/root.ts`
- [ ] Ensure all procedures are `protectedProcedure` (require session)

### Phase 4: Settings UI — Account Management

**Goal:** Give users a page to manage their mail accounts.

#### Tasks

- [ ] Create `src/app/dashboard/settings/page.tsx` — settings page rendered inside the existing sidebar layout
- [ ] Build an "Add Account" form component (`src/components/mail-account-form.tsx`) with fields: label, email, IMAP host/port/TLS toggle, SMTP host/port/TLS toggle, username, password
- [ ] Add a "Test Connection" button that calls `mailAccount.testConnection` and shows success/error feedback
- [ ] Add a "Save" button that calls `mailAccount.create` (or `mailAccount.update` when editing)
- [ ] Display a list of connected accounts with edit and delete actions
- [ ] Add a "Settings" link to the sidebar in `src/components/app-sidebar.tsx` that navigates to the new settings page
- [ ] If no accounts exist, show an onboarding prompt directing the user to add one

### Phase 5: Default Account Selection

**Goal:** Determine which account the rest of the app should use when fetching/sending mail.

#### Tasks

- [ ] When a user saves their first account, automatically set `isDefault: true`
- [ ] Add a "Set as default" action in the account list UI
- [ ] Ensure only one account per user can be the default (unset others in a transaction)

## Acceptance Criteria

- [ ] The `Post` model, router, and related UI are fully removed
- [ ] A `MailAccount` model exists in Prisma with all fields listed above; migration applies cleanly
- [ ] Passwords are encrypted at rest using AES-256-GCM; raw passwords never appear in the database or API responses
- [ ] All `mailAccount` tRPC procedures are protected and scoped to the current user's data
- [ ] A logged-in user can add, view, edit, and delete mail accounts from the settings page
- [ ] The "Test Connection" button provides clear success or error feedback (stubbed for now)
- [ ] One account is marked as default; the first account added is auto-defaulted
- [ ] The settings page is reachable from the sidebar navigation
- [ ] No TypeScript or lint errors after all changes
