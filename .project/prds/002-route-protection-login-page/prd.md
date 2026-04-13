---
title: "Route Protection & Custom Login Page"
status: in-progress
references:
  - type: doc
    url: .project/brief.md
    description: "Project brief — Initial Milestone scope"
  - type: prd
    url: .project/prds/001-mail-account-credentials/prd.md
    description: "Prior PRD — Mail account credentials & data model"
---

> **Instructions for AI Agents:**
> - Mark each task checkbox (`- [x]`) immediately upon completion.
> - Update the `status` field in the frontmatter to reflect the current state:
>   - `in-progress` — when work begins on any phase.
>   - `completed` — when all tasks and acceptance criteria are done.
>   - `on-hold` — if work is blocked or paused.
> - Do not skip tasks or mark them complete without implementing the work.

# Route Protection & Custom Login Page

## Description

The dashboard and all its sub-routes (`/dashboard`, `/dashboard/settings`, `/dashboard/mail/[id]`) are currently accessible to unauthenticated users. While the tRPC layer enforces `protectedProcedure` on data operations, the pages themselves render without any session check. Additionally, the app relies on NextAuth's default sign-in page (`/api/auth/signin`), which provides no branding or user experience continuity.

This PRD covers two concerns:

1. **Route protection** — prevent unauthenticated users from accessing any `/dashboard/*` route by redirecting them to the login page.
2. **Custom login page** — replace the default NextAuth sign-in page with a branded two-column login page built with the shadcn/ui `login-02` block.

### Design Decisions

- **Dashboard layout guard over middleware**: The project uses `PrismaAdapter` for NextAuth, which depends on the Node.js runtime. Next.js middleware runs on the Edge runtime, making it incompatible with the adapter without splitting the auth config. A server-component layout at `src/app/dashboard/layout.tsx` achieves the same protection with less complexity.
- **Full login form retained**: The `login-02` block includes email/password fields alongside the GitHub OAuth button. These fields are kept (non-functional for now) to support future authentication providers without rework.

### User Stories

- **As a** visitor, **I want** to be redirected to a login page when I try to access the dashboard, **so that** I know the app requires authentication.
- **As a** visitor, **I want** to see a branded, professional login page, **so that** I feel confident in the application.
- **As a** visitor, **I want** to sign in with my GitHub account, **so that** I can access the dashboard.
- **As a** logged-in user, **I want** to be redirected to the dashboard after signing in, **so that** I can start using the app immediately.

## Implementation Plan

### Phase 1: Scaffold Login Page (shadcn/ui `login-02` Block)

**Goal:** Add the two-column login page structure and its component dependencies via the shadcn CLI.

#### Tasks

- [x] Run `pnpm dlx shadcn@latest add login-02` to scaffold the block into the project
- [x] Verify the scaffolded files are placed under `src/app/login/page.tsx` and the `LoginForm` component is created (move from `app/` to `src/app/` if the CLI targets the wrong directory)
- [x] Confirm all UI dependencies (`button`, `input`, `label`, `field`) are present — these already exist in the project

### Phase 2: Customize Login Page & Form

**Goal:** Adapt the scaffolded login page to match the app's identity and wire the GitHub button to NextAuth's `signIn` action.

#### Tasks

- [x] Update the brand name from "Acme Inc." to the app name in `src/app/login/page.tsx`
- [x] Replace or remove the `/placeholder.svg` cover image with an appropriate placeholder
- [x] Make the `LoginForm` component a client component (`"use client"`) so it can handle form actions and call `signIn`
- [x] Wire the "Login with GitHub" button to call `signIn("github", { redirectTo: "/dashboard" })` imported from `~/server/auth`
- [x] Keep email/password fields intact but non-functional (ready for future providers)
- [x] Ensure the login page renders correctly on mobile (single-column) and desktop (two-column)

### Phase 3: Configure NextAuth Custom Pages

**Goal:** Tell NextAuth to use the custom login page instead of its default sign-in UI.

#### Tasks

- [ ] Add `pages: { signIn: "/login" }` to `authConfig` in `src/server/auth/config.ts`
- [ ] Verify that visiting `/api/auth/signin` now redirects to `/login`

### Phase 4: Dashboard Route Protection

**Goal:** Prevent unauthenticated users from accessing any route under `/dashboard`.

#### Tasks

- [ ] Create `src/app/dashboard/layout.tsx` as a server component that:
  - Calls `auth()` from `~/server/auth` to retrieve the session
  - If no session exists, calls `redirect("/login")` from `next/navigation`
  - If authenticated, renders `{children}`
- [ ] Verify that `/dashboard`, `/dashboard/settings`, and `/dashboard/mail/[id]` all redirect to `/login` when no session exists
- [ ] Verify that authenticated users can access all dashboard routes normally

### Phase 5: Update Home Page Links

**Goal:** Ensure the home page sign-in/sign-out links point to the correct routes.

#### Tasks

- [ ] In `src/app/page.tsx`, update the sign-in link from `/api/auth/signin` to `/login`
- [ ] Keep the sign-out link pointing to `/api/auth/signout` (NextAuth handles sign-out internally)

## Acceptance Criteria

- [ ] A branded two-column login page exists at `/login` using the shadcn/ui `login-02` block layout
- [ ] The "Login with GitHub" button initiates the GitHub OAuth flow and redirects to `/dashboard` on success
- [ ] Email/password fields are visible but non-functional (no server-side handler)
- [ ] Visiting `/dashboard`, `/dashboard/settings`, or `/dashboard/mail/<any-id>` while unauthenticated redirects to `/login`
- [ ] Authenticated users can access all dashboard routes without interruption
- [ ] The NextAuth default sign-in page is no longer used; `pages.signIn` is set to `/login`
- [ ] The home page sign-in link navigates to `/login`
- [ ] No TypeScript, ESLint, or build errors after all changes
