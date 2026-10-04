# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack Blog CMS built with Next.js (App Router), Supabase, TailwindCSS, and shadcn/ui. Features Supabase Auth with role-based access control (Admin / Author), a WYSIWYG editor (TipTap), draft/publish workflow, and is optimized for AI-assisted development via Claude Code + MCP servers.

## Commands

```bash
pnpm install --frozen-lockfile        # Install dependencies
pnpm run dev        # Start development server
pnpm run build      # Production build
pnpm run lint       # ESLint
```

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Notification feature (required for email confirmation alerts):
```
RESEND_API_KEY=
RESEND_FROM_EMAIL=
ADMIN_EMAIL=
SLACK_WEBHOOK_URL=
WEBHOOK_SECRET=
```

## Database Setup

Migrations and policies are managed via the Supabase CLI (`npx supabase`):

```bash
npx supabase migration new <name>   # Create a new migration
npx supabase db push                # Apply migrations to remote
npx supabase db reset               # Reset local DB and reapply all migrations
```

- Migrations: `supabase/migrations/`
- RLS policies: `database/policies/`

## Architecture

### Route Groups
- `app/(public)/` — Public-facing blog pages (no auth required)
- `app/(dashboard)/` — Protected admin & author dashboard
- `app/api/` — Backend API routes

### Key Modules
- `features/posts/` — Post CRUD, draft/publish logic
- `features/users/` — User management
- `features/auth/` — Auth helpers and session logic
- `lib/supabase/` — Supabase client instances (browser + server)
- `lib/permissions/` — RBAC enforcement logic
- `components/editor/` — TipTap WYSIWYG editor integration
- `components/ui/` — shadcn/ui components
- `supabase/migrations/` — SQL migrations (applied via `npx supabase`)
- `database/policies/` — RLS policies

### Auth & Permissions
- Authentication via **Supabase Auth**
- Two roles: **Admin** (full control) and **Author** (own posts + developer settings)
- **Developer feature** (`/dashboard/developer`) is accessible to both Admin and Author — each user manages their own API keys and LLM provider keys scoped to their `user_id`
- Access control enforced at the database level via **Supabase Row Level Security (RLS)** policies in `database/policies/`
- Client-side RBAC logic lives in `lib/permissions/`

### Data Flow
API routes and Server Components use the Supabase service role client (`lib/supabase/service.ts`). Client Components use the anon key client (`lib/supabase/client.ts`). RLS policies ensure users can only access data they're permitted to see regardless of which client is used.

## MCP Servers

This project is configured to use MCP servers for AI-assisted development:
- `supabase-mcp` — database schema, queries, RLS
- `github-mcp` — repo management, PRs
- `vercel-mcp` — deployments and env management
- `browser-mcp` — UI testing and debugging
