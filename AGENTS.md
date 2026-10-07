# Repository instructions

## Architecture and references

Next.js App Router CMS: `app/` contains public/dashboard/AI routes and API handlers; `features/` owns domain logic; `components/` contains editor and shared UI; `lib/` contains Supabase clients and permissions. Ordered SQL migrations live in `supabase/migrations/`; `database/` holds snapshots, policies and SQL assertions. Unit tests are in `__tests__/`, browser/API tests in `e2e/`, documentation in `docs/`, project skills in `.agents/skills/`.

Start at [documentation index](docs/README.md): [setup](docs/setup/local-development.md), [migrations](docs/setup/migrations.md), [development/testing](docs/development/testing.md), [API](docs/api/developer-api.md), [publication](docs/features/publication-and-slugs.md), and [operations](docs/operations/deployment-verification.md). `docs/superpowers/` is historical evidence, not current setup guidance. `CLAUDE.md` imports this file; skill-local agent files apply within their skill only.

## Toolchain and verification

Use Node **24.21.0** (`.nvmrc`) and pnpm **10.29.3** (`package.json`). Install with `pnpm install --frozen-lockfile`. Commit manifest/`pnpm-lock.yaml` together; use `pnpm add`, preserve strict peers and review dependency scripts in `pnpm-workspace.yaml`. Do not generate npm lockfiles.

- `pnpm run dev`: development server; `pnpm run build`: production build.
- `pnpm run typecheck`: Next route types and TypeScript; `pnpm run lint`: zero-warning ESLint.
- `pnpm run test:run`: unit tests; `pnpm run test:coverage`: coverage thresholds; `pnpm test`: watch mode.
- `pnpm exec playwright install chromium`, then `pnpm run test:e2e`: existing API/browser suite. See testing guide for Docker, credentials and email prerequisites.
- `pnpm run docs:check`: repository documentation paths, anchors, images and skill/lockfile consistency.

## Skills and Next.js

Read the relevant project skill before applying its guidance:

- [React performance](.agents/skills/vercel-react-best-practices/SKILL.md): fetching waterfalls, bundles and renders.
- [Composition](.agents/skills/vercel-composition-patterns/SKILL.md): reusable component APIs, editor/dashboard architecture.
- [shadcn](.agents/skills/shadcn/SKILL.md): existing UI components and registry work; respect `components.json` and the installed component APIs.
- [Playwright CLI](.agents/skills/playwright-cli/SKILL.md): browser inspection, reproduction and smoke verification; complements the TypeScript E2E suite.

Existing [Vitest](.agents/skills/vitest/SKILL.md), [Postgres](.agents/skills/supabase-postgres-best-practices/SKILL.md), [accessibility](.agents/skills/web-design-guidelines/SKILL.md), [Tailwind](.agents/skills/tailwindcss-advanced-layouts/SKILL.md), and [frontend design](.agents/skills/frontend-design/SKILL.md) guides remain available. See [skill setup and maintenance](docs/development/agent-skills.md) for all skills and framework refresh steps. Version-matched Next.js references are installed at `node_modules/next/dist/docs/`; preserve the generated block below.

## Safeguards and change discipline

Keep service-role, provider/encryption, mail, cron and webhook secrets server-only. Service-role clients bypass RLS: explicitly check identity, ownership and roles before privileged access. Preserve private profiles, working copies and recovery grants. `public_author_profiles` deliberately exposes a limited public projection with owner privileges; do not change it to security-invoker without redesigning public access and passing privacy assertions.

Apply all required migrations before application deployment; pause newsletter dispatch for its handoff migration. Never seed/reset/test against production. Use disposable local or explicitly designated remote test databases; retain `e2e/environment.ts` protections. Disable external mail/webhooks during tests. AI output stays draft until a human confirms editorial review; agents must not assert that review automatically. Preserve publication checks, atomic saves, optimistic concurrency, URL reservations and idempotency contracts.

Make focused changes, preserve unrelated work, run checks appropriate to the change, and report unavailable verification honestly. Update canonical documentation with behavior/setup changes. Do not commit credentials, `node_modules`, build output, browser sessions or test artifacts.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
