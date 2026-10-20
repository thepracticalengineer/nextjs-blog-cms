# Deployment configuration

1. Import `thepracticalengineer/nextjs-blog-cms` into Vercel and assign the intended domain.
2. Set Node 24.x and `ENABLE_EXPERIMENTAL_COREPACK=1` for Preview and Production. `vercel.json` runs frozen install/build through `corepack pnpm`, using the manifest's pnpm pin.
3. Complete the [consumer inventory, announced cutoff and retry drain](../api/developer-api.md#consumer-cutoff-and-rollout) before retirement migration/deployment. Apply [migration prerequisites](migrations.md), including pausing newsletter dispatch during its handoff migration.
4. Set [environment variables](local-development.md), trusted `NEXT_PUBLIC_SITE_URL`, and Supabase Auth redirect URLs/templates from [signup confirmation](../features/signup-confirmation.md) and [password recovery](../features/password-recovery.md). Keep all privileged secrets server-only.
5. Configure [authentication abuse controls](../features/auth-abuse-controls.md): the shared-counter migration, server-only HMAC key, trusted ingress header and progressive Turnstile pair. Missing prerequisites block auth actions.
6. Configure the verified Resend sender and [newsletter cron](../features/newsletter.md). Redeploy after environment changes.
7. Keep the existing provider encryption secret unchanged, configure only needed per-author keys in Settings → AI Providers, and remove obsolete provider fallback configuration. Verify public pages, auth, retired API 410 responses, publication/redirects and newsletter queue state with [deployment verification](../operations/deployment-verification.md).

See [dependency upgrade notes](../dependency-upgrade.md) for image-host allowlists, runtime compatibility and audit findings. Preview/test environments must use separate disposable databases and disabled external notification integrations.

Vercel Git integration continues deploying `main` independently of numbered releases. See the [release process](../operations/releases.md) for the human release checkpoint, App setup and migration timing.

## Develop previews and production

Explicitly retain `main` as Vercel's Production Branch when changing GitHub's
default branch to `develop`. Enable Git previews for `develop` and feature
branches. Configure Preview/develop with a separate non-production Supabase
project, its own Auth redirect URLs and site URL, and non-production credentials.
Never copy production service-role/provider/mail/webhook credentials into Preview.
Disable external mail, newsletter dispatch and webhooks; use local mail capture
or approved test integrations for verification. Check branch-specific overrides
as well as Preview defaults. Apply migrations to that test database separately.

Before a production promotion, apply required production migrations and verify
compatibility; pause newsletter dispatch for its handoff migration. The promotion
merge deploys code before the release PR publishes metadata, and that later merge
causes another production deployment. A GitHub Release does not attest to Vercel
success. See [promotion rollout](../operations/branch-promotion.md).
