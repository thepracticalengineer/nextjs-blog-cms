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

Run `pnpm exec playwright test --config=e2e/oauth-ui.config.ts` for desktop/mobile Google and GitHub controls, keyboard activation, real initiation server actions/PKCE cookies, and cancellation callback/error rendering. This separate configuration uses its own `.next-oauth-ui` build/cache directory to avoid reusing the main suite’s Turbopack state after a production build. It forces a loopback fake Auth URL, intercepts provider navigation, disables external mail/analytics, and performs no database seeding or live provider requests.

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

## MFA boundary verification

`pnpm exec vitest run __tests__/auth/mfa-authorization.test.ts __tests__/lib/auth/session.test.ts __tests__/lib/proxy.test.ts`
checks every protected cookie API against AAL1, absent sessions, missing assurance,
Auth failures and thrown provider errors before private reads/service-role access.
It also covers AAL2, non-enrolled sessions, roles, ownership and layout redirects.

`database/tests/mfa_assurance.sql` runs against a migrated disposable database in
CI. Its rolled-back fixtures cover enrolled AAL1/AAL2, stale/missing assurance,
unverified enrollment, private data, storage mutations and public projections.
Run the existing database assertions too, to retain recovery/publication/privacy
contracts.

`pnpm exec playwright test e2e/api/mfa-assurance.spec.ts --project=api` uses real
local Auth and TOTP, cookie-authenticated HTTP requests, direct PostgREST and
Storage requests. It verifies non-enrolled access, AAL1 rejection, the dashboard
MFA redirect, and restored access after verification. It creates and removes its
own disposable account and storage object. Use the dedicated environment above
with mail/webhooks and LLM provider keys disabled; it makes no LLM requests.

## Pull request coverage reports

The **Coverage report** Actions job publishes a summary on every CI run, including
failed runs. Open the PR's Checks tab, then that job/run summary. It shows unit
lines, statements, branches and functions, and separate E2E client coverage and
passed/failed/skipped/flaky counts for `main`, `analytics`, `oauth` and
`publication`. Flaky means a test passed after retry; suites currently default to
zero retries. Tests are counted by final outcome, not by attempt.

The summary identifies the tested commit (the PR merge commit in PR CI), PR head,
run and attempt. It links downloadable artifacts retained for **7 days**:

- `coverage-report`: unit `index.html`, full JSON and `coverage-summary.json`.
- `e2e-reports`: `playwright-report/<suite>/index.html`, JSON test results in
  `test-results/<suite>.json`, failure traces/screenshots in `test-results/<suite>/`,
  and client coverage HTML/JSON in `coverage/e2e/<suite>/` when collected.
- `coverage-baseline`: the rendered summary and machine-readable baseline.

Download and extract an artifact, then open its HTML locally. Each E2E invocation
has its own output and report directories; the production publication regression
cannot erase the main or analytics reports. Uploads run after success or failure.
A server startup/build failure may prevent a suite from producing any report;
this is labeled unavailable/skipped or interrupted, never zero passing tests.
Coverage collection errors are reported as incomplete without overriding the test
exit status. Unit coverage is also generated on assertion failures, and the
existing **80% thresholds on all four metrics remain unchanged**.

### Scope and limitations

Unit coverage retains the explicit include list in `vitest.config.mts`.
`E2E_COVERAGE=1` enables native Chromium JavaScript coverage on the standard
Playwright `page` fixture. Monocart converts source maps into Istanbul HTML/JSON.
Only loaded, mapped source files under `app/`, `components/`, `features/` and
`lib/` that exist in the checkout are included. Dependencies, framework internals,
test harnesses and modules marked `use server` are excluded. Development servers
already provide source maps; production source-map settings are unchanged.

This is **limited client coverage**, not coverage of the entire application:

- Next.js server components, server actions, route handlers, database code, browser
  workers, secondary pages/popups and separately created contexts are not collected.
- Native browser coverage can lose earlier documents on full navigation even with
  `resetOnNavigation: false`. A page closed before teardown produces an incomplete
  collection warning. Results include attempts from retries and failed tests.
- Unloaded files are not in the denominator. Source maps and emitted client code
  differ between the Vite analytics harness and Next.js; suite percentages must
  not be averaged or combined with unit coverage.
- The production publication suite uses HTTP requests only: its **client and
  server coverage are unavailable**, while its test results and HTML report remain
  available. API test counts are never presented as code coverage.
- Zero-denominator metrics and missing source maps are unavailable, not 100%.

The summary compares each metric with a retained compatible artifact from a
successful `main` push CI run for the **exact PR base SHA** (the previous SHA on
main push runs). No code from that baseline is executed. First rollout, missing or
expired artifacts, read permission failures and incompatible report formats show
`baseline unavailable`. Changes are percentage points; loaded-file denominators
can change between commits, so inspect detailed reports when interpreting deltas.

The workflow uses read-only permissions, isolated local Supabase, and disabled
external mail/webhooks. Build validation uses placeholder credentials. Reporting
uses `actions: read` only to retrieve baselines; it never runs under
`pull_request_target` or requests comment/write permissions. Forks use the same
job summary fallback. Reruns produce an attempt-specific summary and no comments,
so there are no duplicate comments to clean up. Artifact access requires GitHub
access to the run; fork workflow execution may require maintainer approval.

### Local commands and configuration

```bash
pnpm run test:coverage
E2E_COVERAGE=1 pnpm run test:e2e
E2E_COVERAGE=1 pnpm exec playwright test --config=e2e/analytics.config.ts
E2E_COVERAGE=1 pnpm exec playwright test --config=e2e/oauth-ui.config.ts
# Build with the same disposable database and disabled integrations first:
pnpm run build
E2E_COVERAGE=1 E2E_PRODUCTION=1 pnpm exec playwright test e2e/api/posts.publication-pages.spec.ts --project=api
pnpm exec playwright show-report playwright-report/main
node --test scripts/coverage/*.test.mjs
```

Run unit coverage before E2E when retaining both locally: Vitest cleans its own
`coverage/` directory. Each E2E run only replaces its own suite's reports.
`e2e/reporting.ts` controls report paths; `e2e/coverage/options.ts` controls source
filtering; `scripts/coverage/report.mjs` renders the CI summary. Coverage collection
is opt-in locally and enabled in the CI E2E job. No external coverage service or
additional repository secret is required.
