# Testing

## Unit Tests (Vitest)

Covers lib utilities, API routes, services, and UI components with 80%+ thresholds across lines, branches, functions, and statements.

```bash
pnpm run typecheck         # route types and full TypeScript check
pnpm test                  # watch mode
pnpm run test:run          # single run
pnpm run test:coverage     # coverage report
```

## End-to-End Tests (Playwright)

The suite covers posts REST API contracts and browser flows including public navigation/newsletter/registration validation, editor save and publish, profile updates, PDF upload/chat, and MFA enrollment/login. Provider generation is stubbed; auth, PDF parsing, and database writes use the real local services.

Use a **dedicated disposable Supabase test project**, never production. Apply all `supabase/migrations` or start the local stack with `pnpm dlx supabase@2.119.0 start`. Put its `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the ignored `.env.e2e` file. The Playwright server inherits those values. Set `RESEND_API_KEY` and `SLACK_WEBHOOK_URL` to empty values in that file to keep local verification isolated from external integrations.

```bash
pnpm exec playwright install chromium
pnpm run test:e2e                       # API and browser suites
pnpm exec playwright test --project=api          # HTTP tests only
pnpm exec playwright test --project=browser      # browser tests only
pnpm run test:e2e:report                # open the HTML report
```

Playwright starts its own server by default. Set `E2E_BASE_URL` for a different port; `E2E_REUSE_SERVER=1` explicitly reuses an existing local server configured for the same test database. Global setup seeds a disposable author, API key, and posts; teardown removes that user's rows and auth account. The newsletter smoke test removes its own subscription.

CI also runs rolled-back database assertions from `database/tests/` for public author privacy, working copies, URL reservations, atomic saves and newsletter queue semantics. Run them only against an isolated migrated database. See [agent skills](agent-skills.md) for an additional interactive CLI smoke flow. Set `E2E_MAILPIT_URL` for password recovery email verification. Suite counts change; use `pnpm exec playwright test --list` for the current inventory.

## Documentation checks

Run `pnpm run docs:test` for isolated checker regression fixtures, then `pnpm run docs:check` for repository links, anchors, images, skill/lockfile membership and Claude discovery symlinks. Both run in CI.
