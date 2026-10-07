# Issue #85 verification

Verification date: October 7, 2026. Node 24.21.0, pnpm 10.29.3, Next.js 16.3.8 and Playwright 1.63.0.

## Setup and documentation

- `pnpm install --frozen-lockfile` passed with the existing dependency lockfile.
- The three documented `npx skills add` commands installed all four requested skills into `.agents/skills/`. `npx skills list --agent codex` discovers all four for Codex; existing skills and the Claude compatibility copy remain available.
- `node_modules/next/dist/docs/` contains the version-matched App Router, Pages Router, architecture and community references. The installed `hasCurrentAgentRules(process.cwd())` returns `true`; development startup preserves the current managed block in root `AGENTS.md` without adding a second one to `CLAUDE.md`.
- `pnpm run docs:check` passed for 37 repository documents and 11 project skills. Missing-file and missing-anchor temporary fixtures were rejected, then removed. The check covers local Markdown links, anchors, images and skill/lockfile membership; it does not crawl external websites or recompute upstream skill hashes.
- README decreased from 674 to 67 lines. README and documentation index were rendered with a GFM Markdown renderer and inspected in Chromium. The index exposes all topic directories and historical plans/specifications; screenshot links resolve.
- `pnpm run lint`, `pnpm run typecheck`, and `git diff --check` passed. `pnpm run test:run` passed all 847 tests. `pnpm exec playwright test --list` discovers the existing 40 E2E tests in 13 files.

## Disposable Playwright CLI smoke

The default Supabase ports were already occupied by another project. Verification copied the repository's Supabase configuration, migrations and templates into a temporary directory, changed `project_id` to `issue85-smoke`, and moved ports to 55320–55329. Supabase CLI 2.119.0 started that separate Docker stack and applied every migration, including newsletter delivery handoff. Other projects were left running.

The app ran on port 3100 with that stack's URL/keys explicitly exported to its process. External mail, webhooks and provider integrations were disabled. `pnpm exec playwright cli --help` and Chromium installation passed; the local CLI config selected headless Chromium rather than requiring system Chrome.

The `cms-smoke` CLI session verified:

1. Home renders successfully with the disposable database's empty article list.
2. Login renders and empty submission shows `Invalid email address` and `Password must be at least 6 characters`.
3. An unauthenticated `/dashboard` visit redirects to `/login`.
4. The application's console reports zero errors and warnings during the checked flow.

All five rolled-back SQL assertion scripts passed on `supabase_db_issue85-smoke`: public-author privacy, working-copy permissions, slug routes, atomic posts and newsletter queue constraints. Browser sessions and temporary app/documentation servers were closed; `supabase stop --no-backup` removed only the disposable verification stack. Generated route-type changes and browser artifacts were excluded from the commit.

The full E2E suite and production build were not rerun for this documentation/skill change. No application routes, services, migrations, existing test files or runtime dependency versions changed. No production services, publication or email dispatch were used.
