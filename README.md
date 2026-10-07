# Next.js Blog CMS

A full-stack blog CMS with a TipTap editor, Supabase authentication, Admin/Author roles, draft publication, an AI writing assistant, newsletter subscriptions and a headless REST API.

## Features and stack

- Next.js App Router, React, TypeScript, TailwindCSS and shadcn/ui.
- Supabase Postgres, Auth and Storage with private author data and role/ownership checks.
- Rich text, images, tags/categories, comments, public author profiles and SEO metadata.
- Human-reviewed publication, reserved article URLs, redirects and atomic saves.
- PDF-assisted drafting with Claude, Gemini or OpenAI and encrypted per-user provider keys.
- Developer API keys, optional idempotent creation and delayed Resend newsletters.
- Vitest, Playwright API/browser tests and Vercel deployment.

## Quick start

Use Node **24.21.0** and pnpm **10.29.3**. Local Supabase requires Docker.

```bash
git clone https://github.com/thepracticalengineer/nextjs-blog-cms.git
cd nextjs-blog-cms
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm dlx supabase@2.119.0 start
```

Follow [local setup](docs/setup/local-development.md) to put the local Supabase URL, anon key and server-only service-role key in `.env.local`, set the trusted site URL, and configure optional integrations. Apply the complete migration history; the historical schema snapshot alone is insufficient. Then run:

```bash
pnpm run dev
```

Open [localhost:3000](http://localhost:3000). Keep tests on disposable databases and AI content in drafts until human editorial review. See [migration prerequisites](docs/setup/migrations.md) before deploying.

## Project structure

```text
app/                   Public, dashboard, AI routes and backend API
components/            Shared UI, blog and TipTap editor
features/              Posts, auth, profiles, AI, newsletter and other domains
lib/                   Supabase clients, permissions and utilities
supabase/migrations/   Ordered database migration history
supabase/templates/    Auth email templates
database/              Historical SQL snapshots, policies and verification
__tests__/             Unit and component tests
e2e/                   Playwright API and browser suite
docs/                  Canonical guides and historical plans/specifications
.agents/skills/        Repository-scoped coding-agent skills
```

## Documentation

Start at the [documentation index](docs/README.md). Coding agents should read [AGENTS.md](AGENTS.md).

- [Setup and environment](docs/setup/local-development.md), [migrations](docs/setup/migrations.md), [deployment](docs/setup/deployment.md), [webhooks](docs/setup/webhooks.md).
- [Agent skills](docs/development/agent-skills.md), [AI/MCP workflows](docs/development/ai-workflows.md), [testing](docs/development/testing.md), [dependency management](docs/dependency-upgrade.md).
- [Developer API](docs/api/developer-api.md) and [publication, concurrency and idempotency](docs/api/publication-and-writes.md).
- [Roles](docs/features/roles-and-permissions.md), [AI assistant](docs/features/ai-assistant.md), [newsletter](docs/features/newsletter.md), [password recovery](docs/features/password-recovery.md), [author profiles](docs/features/public-author-profiles.md), [publication and slugs](docs/features/publication-and-slugs.md).
- [Deployment verification](docs/operations/deployment-verification.md), [content cleanup and dated audit](docs/operations/content-cleanup.md), [screenshots](docs/features/screenshots.md), [roadmap](docs/features/roadmap.md).

## Contributing and license

See [contribution workflow and code of conduct](docs/development/contributing.md). Open an issue for significant changes, use a focused branch, update relevant guides and describe verification in the PR.

[MIT license](LICENSE). Maintained by Frank Mendez.
