# Agent skills and framework references

Skills guide coding agents; they are committed instruction/reference files, not application dependencies. A fresh checkout already contains the project skills in `.agents/skills/`. They become available to Codex when it next loads the project/session.

## Installation and restoration

Run from the repository root without `--global`:

```bash
npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices vercel-composition-patterns --agent codex -y
npx skills add shadcn-ui/ui --skill shadcn --agent codex -y
npx skills add microsoft/playwright-cli --skill playwright-cli --agent codex -y
npx skills list --agent codex
npx skills list --agent claude-code
```

| Skill | Apply when |
| --- | --- |
| [vercel-react-best-practices](../../.agents/skills/vercel-react-best-practices/SKILL.md) | Reviewing React fetching waterfalls, bundle size and rendering |
| [vercel-composition-patterns](../../.agents/skills/vercel-composition-patterns/SKILL.md) | Designing component APIs and editor/dashboard composition |
| [shadcn](../../.agents/skills/shadcn/SKILL.md) | Working with existing UI components, registries and `components.json` |
| [playwright-cli](../../.agents/skills/playwright-cli/SKILL.md) | Inspecting browsers and reproducing editor/auth/newsletter bugs |

Preserve existing [Vitest](../../.agents/skills/vitest/SKILL.md), [Postgres](../../.agents/skills/supabase-postgres-best-practices/SKILL.md), [accessibility](../../.agents/skills/web-design-guidelines/SKILL.md), [Tailwind](../../.agents/skills/tailwindcss-advanced-layouts/SKILL.md), [frontend design](../../.agents/skills/frontend-design/SKILL.md), [UI/UX](../../.agents/skills/ui-ux-pro-max/SKILL.md), and [Zustand adapter](../../.agents/skills/zustand/SKILL.md) skills. The adapter skill applies only to json-render integration. Claude Code discovers the same canonical skills through relative symlinks in `.claude/skills/`; do not maintain separate copies. `docs:check` requires every project skill to have a matching Claude link and rejects broken, copied or misdirected entries.

Installation resolves upstream revisions and refreshes `skills-lock.json`; it is not an exact historical restore. Restore a known version using Git. For updates, rerun the specific installation command, review all instruction/reference changes and the computed hash, verify discovery and run `pnpm run docs:check`. When adding a skill, add a relative Claude discovery link with `ln -s ../../.agents/skills/<skill> .claude/skills/<skill>`. Commit the skill files, links and lockfile together. Do not copy machine-specific absolute paths or install only globally. Check upstream guidance against installed framework/components before following it.

## Version-matched Next.js guidance

Next.js **16.3.8** installs reference Markdown in `node_modules/next/dist/docs/`. No separate reference skill is needed. [Official migration guidance](https://github.com/vercel-labs/next-skills) explains the bundled-docs model.

After `pnpm install --frozen-lockfile`, read the relevant App Router guide under that directory. `AGENTS.md` hosts Next.js's managed `BEGIN:nextjs-agent-rules` block; `CLAUDE.md` imports the root file. Keep repository instructions outside the managed markers. Existing skill-local `AGENTS.md` files are scoped to their skills.

On this installed version, `next dev` calls `ensureAgentRulesForDev` only when a coding agent is detected. An ordinary terminal launch need not generate rules. If a managed block already exists in `CLAUDE.md`, generation keeps that location instead of migrating it to a new root file. This repository consolidates the block in root `AGENTS.md` to avoid duplicate guidance.

After framework upgrades:

1. Install the updated dependencies/lockfile and inspect the new `node_modules/next/dist/docs/` references.
2. Run `pnpm run dev` from Codex or another detected coding agent; stop it after startup. Review the managed-block diff and preserve repository instructions.
3. Confirm the block matches the installed generator, and run documentation checks:

```bash
node -e "console.log(require('next/package.json').version); console.log(require('next/dist/server/lib/generate-agent-files').hasCurrentAgentRules(process.cwd()))"
pnpm run docs:check
```

If agent detection is unavailable, the installed version exposes this fallback (an internal API: recheck it after upgrades):

```bash
node -e "require('next/dist/server/lib/generate-agent-files').writeAgentFiles(process.cwd())"
```

Commit the reviewed instruction changes, not `node_modules`, `.next` or generated route types. Fresh checkouts obtain the matching reference through normal dependency installation.

## Playwright CLI prerequisites and smoke flow

The skill does not install a browser/runtime. This repository's pinned Playwright **1.63.0** includes the CLI, verified with:

```bash
pnpm exec playwright --version
pnpm exec playwright cli --help
pnpm exec playwright install chromium
```

Use `pnpm exec playwright cli` wherever the skill says `playwright-cli`. On Linux, missing system libraries require `pnpm exec playwright install --with-deps chromium` (may require administrator privileges). A separate global `@playwright/cli` installation is optional; see [upstream runtime documentation](https://github.com/microsoft/playwright-cli). Chrome is the default channel; select the installed Chromium explicitly for portable verification:

```json
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": { "channel": "chromium", "headless": true }
  }
}
```

Save that as an ignored local `.playwright/cli.config.json`. Browser snapshots, console logs, screenshots and sessions can contain private data; keep `.playwright/` and `.playwright-cli/` artifacts out of Git.

Start a dedicated migrated local Supabase stack using [testing setup](testing.md). Supply its credentials explicitly to the dev-server process so production `.env.local` values cannot win; blank mail/webhook/provider integration keys. Unlike the E2E runner, an interactive CLI does **not** automatically load `.env.e2e`, enforce database guards, seed users or clean fixtures. Verify the target before starting. If another stack occupies default ports, copy `supabase/` to a temporary directory, change its `project_id` and ports, and run the CLI from there; do not stop another project's containers.

After verifying `.env.e2e` contains only disposable credentials, set `NEXT_PUBLIC_SITE_URL=http://localhost:3100` there, blank `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`, `WEBHOOK_SECRET` and `CRON_SECRET`, and start the app in a separate terminal:

```bash
DOTENV_CONFIG_PATH=.env.e2e DOTENV_CONFIG_OVERRIDE=true node -r dotenv/config node_modules/next/dist/bin/next dev --port 3100
```

The explicit dotenv preload exports the test values before Next.js loads `.env.local`. Ensure every required Supabase value is present; a missing test variable could otherwise fall back to local configuration. Then run:

```bash
pnpm exec playwright cli -s=cms-smoke open http://localhost:3100
pnpm exec playwright cli -s=cms-smoke snapshot
pnpm exec playwright cli -s=cms-smoke goto http://localhost:3100/login
pnpm exec playwright cli -s=cms-smoke snapshot
pnpm exec playwright cli -s=cms-smoke console error
pnpm exec playwright cli -s=cms-smoke close
```

Use fresh snapshot references for interactions. Verify public navigation, login validation and expected unauthenticated dashboard redirect; for writes, create only disposable accounts/content and remove those fixtures afterward. Inspect console errors and database changes. The TypeScript suite remains the canonical repeatable API/editor/auth/newsletter verification; run it using [testing commands](testing.md), not the interactive CLI as a replacement.

See [issue #85 verification record](../operations/issue-85-verification.md) for the tested environment and results.
