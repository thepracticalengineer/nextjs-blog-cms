# Issue #85 verification

Verification date: October 7, 2026. Node 24.21.0, pnpm 10.29.3, Next.js 16.3.8 and Playwright 1.63.0.

## Setup and documentation

- `pnpm install --frozen-lockfile` passed with the existing dependency lockfile.
- The three documented `npx skills add` commands installed all four requested skills into `.agents/skills/`. `npx skills list --agent codex` discovers all four for Codex; existing skills remain available. The review follow-up below replaces the stale Claude copy with canonical discovery links.
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

During the initial documentation-only verification, the full E2E suite and production build were not rerun. No application routes, services, migrations or runtime dependency versions changed. No production services, publication or email dispatch were used. The subsequent test synchronization change and full-suite verification are recorded below.

## Review follow-up and failed-check repair

PR #89's first CI run passed lint, unit tests, build and Sonar's gate but failed one of 40 E2E cases. The published-draft recovery test typed into a controlled input before hydration/recovery initialization, then restored the original title prepended to the intended edit. The test now waits for the existing recovery-ready indicator before filling and asserts the exact input value before autosave; all privacy, restore and conflict assertions remain intact.

Claude discovery now uses relative symlinks to the canonical `.agents/skills/` files, including the refreshed React skill. Both agent discovery commands list the requested skills. Checker regression coverage rejects missing/copied/broken/misdirected Claude aliases and missing same-file anchors; fenced examples and valid duplicate/cross-file anchors are also covered. Sonar's initial nested-ternary and regex findings were addressed with explicit traversal and linear scans. The environment guide now lists the trusted site URL, optional public analytics ID, server-only provider fallbacks and the exact 32-byte UTF-8 encryption requirement.

Follow-up verification passed `pnpm run docs:test` (8 cases), `pnpm run docs:check`, lint, typecheck and whitespace checks. The full existing Playwright suite passed **all 40 tests** against the disposable migrated stack, with the app on port 3000 to match Supabase's configured recovery redirects. No application behavior changed. The disposable fixtures were cleaned by teardown; the stack was stopped afterward.
