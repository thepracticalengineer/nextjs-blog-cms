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

## Social authentication

Run `pnpm exec vitest run __tests__/auth __tests__/lib/auth/session.test.ts __tests__/lib/proxy.test.ts __tests__/api/signout.test.ts __tests__/components/profile/ChangePasswordForm.test.tsx` for OAuth, recovery, MFA and logout coverage. The OAuth SDK tests use the installed SDK with stubbed HTTP responses and inspect persisted cookies for provider-token leakage. They do not call Google/GitHub or validate real account linking. See the [provider rollout checklist](../setup/social-auth.md#verification-and-rollout) for dedicated-account manual checks.

Run `pnpm exec playwright test --config=e2e/oauth-ui.config.ts` for desktop/mobile Google and GitHub controls, keyboard activation, real initiation server actions/PKCE cookies, and cancellation callback/error rendering. This separate configuration forces a loopback fake Auth URL, intercepts provider navigation, disables external mail/analytics, and performs no database seeding or live provider requests.

## Post-list scale and publication verification

`database/tests/post_lists.sql` checks generated reading time, literal search,
page boundaries beyond 1,000 rows, complete category facets and author/admin/anonymous
permissions in a rolled-back transaction. CI runs it after migrations.

`e2e/browser/post-lists.spec.ts` seeds and removes 1,005 posts in the dedicated test
project. It checks URL navigation, filtering/sorting, reload/Back, taxonomy pagination
and absence of article bodies in list responses. `e2e/api/posts.publication-pages.spec.ts`
warms public pages and checks creation, edits, URL/taxonomy changes, unpublication and
delete. Run the latter against a production build as well: development mode does not
reproduce the static-to-dynamic failure for newly created URLs. CI builds the app and
runs this regression with `E2E_PRODUCTION=1`, which makes Playwright start `next start`
instead of `next dev`. Start a prebuilt local server with
the same disposable database and disabled mail/webhooks, then set `E2E_BASE_URL` and
`E2E_REUSE_SERVER=1` to reuse it.

For reproducible timings, use `node scripts/benchmark-post-lists.mjs` with `.env.e2e`.
Optional `--before-url` and `--after-url` compare two local production builds against
the same disposable database. The script seeds 1,500 synthetic posts, makes seven
warm measurements per query/flow, reports JSON payload bytes and timings, and removes
its fixtures. See [recorded measurements](../operations/post-list-performance.md).

## Analytics isolation

Run `pnpm exec vitest run __tests__/analytics __tests__/api/newsletter/subscribe.test.ts` for collection boundaries and newsletter event contracts. Run `pnpm exec playwright test --config=e2e/analytics.config.ts` for the standalone desktop/mobile runtime and consent-component harness; it stubs the Google loader and blocks external requests, with no database or mail. This does not validate live Google ingestion or the rendered Next.js integration. See [the analytics verification matrix](../setup/google-analytics.md#verification) for the remaining app/property rollout checks.
