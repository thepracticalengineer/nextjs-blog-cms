# Deployment configuration

1. Import `thepracticalengineer/nextjs-blog-cms` into Vercel and assign the intended domain.
2. Set Node 24.x and `ENABLE_EXPERIMENTAL_COREPACK=1` for Preview and Production. `vercel.json` runs frozen install/build through `corepack pnpm`, using the manifest's pnpm pin.
3. Apply [migration prerequisites](migrations.md), including pausing newsletter dispatch during its handoff migration.
4. Set [environment variables](local-development.md), trusted `NEXT_PUBLIC_SITE_URL`, and Supabase Auth redirect URLs/templates from [password recovery](../features/password-recovery.md). Keep all privileged secrets server-only.
5. Configure the verified Resend sender and [newsletter cron](../features/newsletter.md). Redeploy after environment changes.
6. Verify public pages, auth, API, publication/redirects and newsletter queue state with [deployment verification](../operations/deployment-verification.md).

See [dependency upgrade notes](../dependency-upgrade.md) for image-host allowlists, runtime compatibility and audit findings. Preview/test environments must use separate disposable databases and disabled external notification integrations.
