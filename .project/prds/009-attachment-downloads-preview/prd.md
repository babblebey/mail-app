---
title: "Attachment Downloads, List Indicator & Inline Preview"
status: not-started
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
  - type: prd
    url: .project/prds/003-imap-fetch-folders-and-messages/prd.md
    description: "Prior PRD — IMAP fetch folders & messages (attachment metadata deferred download to future PRD)"
  - type: prd
    url: .project/prds/008-thread-view-sender-display-email-details/prd.md
    description: "Prior PRD — Thread view sender display & email details popover (completed)"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Attachment Downloads, List Indicator & Inline Preview

## Description

The mail client currently displays attachment metadata (filename, size) as non-interactive chips in the thread view. Users cannot download, open, or preview attachments. The mail list view also does not indicate which messages have attachments, despite the `hasAttachments` flag being available from the backend.

This PRD covers:

1. Adding a paperclip indicator in the mail list for messages with attachments.
2. Creating a Next.js API route to stream attachment content from IMAP.
3. Making attachment chips in the thread view interactive — downloadable and previewable.
4. Adding a Dialog-based preview for images and PDFs.

### Design Decisions

- **Next.js API route over tRPC for downloads**: tRPC cannot efficiently stream binary content. A raw Next.js route handler with proper `Content-Type`, `Content-Disposition`, and `Content-Length` headers enables browser-native downloads and inline preview via `<img>` / `<iframe>` tags.
- **Attachment index as identifier**: The array index from `simpleParser`'s `parsed.attachments` output is used to identify a specific attachment. This avoids depending on CID or content-ID fields, which may be absent on many attachments. The index is stable for a given message since the MIME structure does not change.
- **`preview=1` query param for inline rendering**: When the API route receives `preview=1`, it sets `Content-Disposition: inline` instead of `attachment`, allowing the browser to render the content in-place (e.g. inside an `<img>` tag or `<iframe>`). Without `preview=1`, the browser triggers a file download.
- **Dialog over inline expand for preview**: Clicking a previewable attachment opens a modal Dialog rather than expanding inline. This keeps the message view uncluttered and provides a focused viewing experience — consistent with how Gmail and other clients handle attachment preview.
- **Preview scope — images and PDFs only**: Inline preview supports image types (`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`) and PDFs. Other file types (archives, documents, audio, video) download directly. This covers the most common previewable attachment types without introducing complex rendering dependencies.
- **Paperclip icon placement in mail list**: The `PaperclipIcon` is rendered next to the starred icon in the message row's name/metadata section, using existing icon styling (`size-3.5 shrink-0 text-muted-foreground`). The `hasAttachments` flag is already returned by `listMessages` but currently unused in the UI.
- **Download button on previewable chips**: Previewable attachment chips open a preview Dialog on click, but also include a small download icon button so users can download without opening the preview first.
- **Re-downloading full message for attachment content**: The API route uses the same `client.download(uid)` → `simpleParser` pattern as `getMessage`. While this re-downloads the full RFC822 message, it is the simplest approach given ImapFlow's API. A future optimization could cache parsed messages or use selective MIME part fetching.
- **Download loading indicator via fetch + blob**: Instead of native `<a>` download links, attachment downloads use `fetch` to retrieve the file as a blob, then programmatically trigger a download. This enables tracking a `downloadingIndex` state that swaps the icon to an animated spinner and disables the button during the download. The loading indicator applies to non-previewable chip clicks, the download icon on previewable chips, and the Download button in the preview Dialog.

### User Stories

- **As a** user viewing the mail list, **I want** to see a paperclip icon on messages that have attachments, **so that** I can quickly identify which messages contain files without opening them.
- **As a** user viewing a message with attachments, **I want** to click an attachment chip to download the file, **so that** I can save it to my device.
- **As a** user viewing a message with image attachments, **I want** to click an image attachment and see a preview in a modal, **so that** I can view the image without downloading it first.
- **As a** user viewing a message with a PDF attachment, **I want** to click the PDF attachment and see it rendered in a modal, **so that** I can read the document without leaving the mail client.

## Implementation Plan

### Phase 1: Add Dialog UI Component

**Goal:** Install the shadcn Dialog primitive so it is available for the attachment preview modal.

#### Tasks

- [x] Run `pnpm dlx shadcn@latest add dialog` to generate `src/components/ui/dialog.tsx` with the project's `radix-luma` style preset

### Phase 2: Attachment Indicator in Mail List

**Goal:** Show a paperclip icon on message rows that have attachments.

#### Tasks

- [x] In `src/components/mail-list.tsx`, import `PaperclipIcon` from `lucide-react`
- [x] In the message row name/metadata section, add a `<PaperclipIcon>` next to the date section when `mail.hasAttachments` is `true` — styled as `size-3.5 shrink-0 text-muted-foreground` to match existing icon conventions

### Phase 3: Attachment Download API Route

**Goal:** Create a GET endpoint that authenticates the user, fetches the requested attachment from IMAP, and streams the binary content back to the browser.

#### Tasks

- [x] Create `src/app/api/attachments/route.ts` as a Next.js route handler (GET)
- [x] Accept query parameters: `folder` (string), `uid` (number), `index` (attachment array index, number), `accountId` (optional string), and `preview` (optional `"1"`)
- [x] Validate authentication via `auth()` from `~/server/auth` — return a `401` JSON response if the session is missing
- [x] Validate and parse query parameters with Zod — return a `400` JSON response with error details on invalid input
- [x] Use `withImapClient` and `resolveAccountId` from `~/server/imap/client` to connect to the user's IMAP server
- [x] Open the specified folder via `client.mailboxOpen(folder)`
- [x] Download the full message via `client.download(uid.toString(), undefined, { uid: true })` and collect the stream into a `Buffer`
- [x] Parse the raw message with `simpleParser` from `mailparser`
- [x] Retrieve the attachment at `parsed.attachments[index]` — return a `404` JSON response if the index is out of bounds or attachments are empty
- [x] Return a `Response` with the attachment's `content` buffer, setting headers:
  - `Content-Type` — from `attachment.contentType`
  - `Content-Length` — from `attachment.size`
  - `Content-Disposition` — `inline; filename="..."` when `preview=1`, otherwise `attachment; filename="..."`

### Phase 4: Interactive Attachment Chips in Thread View

**Goal:** Make attachment chips in the thread view downloadable, and open a preview Dialog for images and PDFs.

#### Tasks

- [x] In `src/components/mail-thread.tsx`, import `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from `~/components/ui/dialog` and `DownloadIcon` from `lucide-react`
- [x] Add a `isPreviewable(contentType: string): boolean` helper that returns `true` for image types (`image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml`) and `application/pdf`
- [x] Add a `getAttachmentUrl(folder: string, uid: number, index: number, preview?: boolean): string` helper that builds the `/api/attachments?folder=...&uid=...&index=...&preview=1` URL
- [x] Update the attachment `.map()` to include the iteration index
- [x] For **non-previewable** attachments: wrap the chip in an `<a>` tag with `href` pointing to the download URL and a `download` attribute set to the filename
- [x] For **previewable** attachments: make the chip a clickable button that sets preview state; also render a small `<a>` download icon button (with `DownloadIcon`) linking to the download URL so users can download without previewing
- [x] Add a `previewAttachment` state to `MessageView` — `{ index: number; filename: string; contentType: string; url: string } | null`

### Phase 5: Attachment Preview Dialog

**Goal:** Render image and PDF previews inside a modal Dialog triggered by clicking a previewable attachment chip.

#### Tasks

- [x] In `MessageView`, render a `Dialog` controlled by `previewAttachment` state (`open` when state is non-null, `onOpenChange` clears it)
- [x] In the `DialogHeader`, display the attachment filename via `DialogTitle`
- [x] In the `DialogContent` body:
  - When the content type starts with `image/`: render an `<img>` tag with `src` set to the preview URL (`preview=1`), `alt` set to the filename, and responsive sizing (`max-h-[70vh] w-auto object-contain`)
  - When the content type is `application/pdf`: render an `<iframe>` with `src` set to the preview URL, sized to fill the dialog (`w-full h-[70vh]`)
- [x] Include a download `<a>` link (styled as a Button) in the dialog that points to the non-preview download URL with a `download` attribute

## Acceptance Criteria

- [ ] Messages with attachments show a paperclip icon in the mail list; messages without attachments do not
- [ ] The paperclip icon uses consistent styling with other metadata icons in the mail list row
- [ ] Clicking a non-previewable attachment chip in the thread view downloads the file with the correct filename and content type
- [ ] Clicking a previewable image attachment opens a Dialog showing the rendered image
- [ ] Clicking a previewable PDF attachment opens a Dialog showing the embedded PDF
- [ ] The preview Dialog displays the attachment filename in its header
- [ ] The preview Dialog includes a download button that saves the file
- [ ] The preview Dialog dismisses on outside click or Escape keypress
- [ ] Previewable attachment chips also have a visible download icon button for direct download without opening the preview
- [ ] The `/api/attachments` route returns `401` for unauthenticated requests
- [ ] The `/api/attachments` route returns `400` for missing or invalid query parameters
- [ ] The `/api/attachments` route returns `404` when the attachment index is out of bounds
- [ ] The `/api/attachments` response includes correct `Content-Type`, `Content-Disposition`, and `Content-Length` headers
- [ ] No TypeScript or lint errors after all changes
- [ ] No visual regressions in the mail list or thread view for messages without attachments
