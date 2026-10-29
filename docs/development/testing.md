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

The suite covers retired API tombstones and browser flows including public navigation/newsletter/registration validation, editor save and publish, profile updates, AI Providers settings and MFA enrollment/login. Verify retired routes return `410 API_RETIRED` for absent, invalid and formerly valid credentials without mutations or provider calls. PDF upload/chat/full-post generation are retired; do not run paid generation as a retirement smoke check.

Use a **dedicated disposable Supabase test project**, never production. Apply all `supabase/migrations` or start the local stack with `pnpm dlx supabase@2.119.0 start`. Put its `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the ignored `.env.e2e` file. The Playwright server inherits those values. Set a disposable test-only 32-byte `LLM_KEY_ENCRYPTION_SECRET` for the provider settings save/remove smoke test; no verification/provider request is made. Set `RESEND_API_KEY` and `SLACK_WEBHOOK_URL` to empty values in that file to keep local verification isolated from external integrations.

```bash
pnpm exec playwright install chromium
pnpm run test:e2e                       # API and browser suites
pnpm exec playwright test --project=api          # HTTP tests only
pnpm exec playwright test --project=browser      # browser tests only
pnpm run test:e2e:report                # open the HTML report
```

Playwright starts its own server by default. Set `E2E_BASE_URL` for a different port; `E2E_REUSE_SERVER=1` explicitly reuses an existing local server configured for the same test database. Global setup seeds a disposable author and posts; legacy credentials used by retirement assertions must remain test-only; teardown removes that user's rows and auth account. The newsletter smoke test removes its own subscription.

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
and absence of article bodies in list responses. `e2e/browser/publication-pages.spec.ts`
warms public pages and checks editor publication, edits, URL/taxonomy changes and unpublication. Run the latter against a production build as well: development mode does not
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

## Signup confirmation

CI runs `node scripts/prepare-e2e-supabase.mjs` before starting its disposable
stack. It allocates available local listener ports instead of assuming default
ports are free, then exports actual URLs from `supabase status`. This only changes
the runner's config file; it never stops unrelated services or changes Auth/SMTP
settings. Run it from a separate disposable project's directory to prepare that
stack; it does not accept arbitrary file paths. Its regression tests run with
`node --test scripts/prepare-e2e-supabase.test.mjs`.

Run `pnpm exec vitest run __tests__/auth` for fixed signup verification types and
destinations, recovery isolation, safe callback messages, neutral resend, trusted
origins and the UI cooldown. Run
`pnpm exec playwright test e2e/browser/signup-confirmation.spec.ts --project=browser`
against the dedicated local stack with loopback `E2E_MAILPIT_URL`, disabled external
mail/webhooks and matching `NEXT_PUBLIC_SITE_URL`/`E2E_BASE_URL`. The suite reads actual
signup emails, confirms in initiating/fresh browsers, rejects replay/expiry and
invalid types, verifies resend and the provider cooldown, and checks the mobile
retry path. Docker is required for the fixture that ages only its disposable
user's `auth.users.confirmation_sent_at`; only the default
`supabase_db_nextjs-blog-cms` or `E2E_AUTH_DB_CONTAINER=supabase_db_cms-issue106`
containers on a loopback Auth URL are accepted. User fixtures are deleted after
each case. Hosted Auth/SMTP configuration and email-client presentation still
require the [deployment checks](../features/signup-confirmation.md).

## CI validation paths

See the [CI event matrix and rollout](ci.md) for full/lightweight classification,
parallel database/browser jobs, PR-scoped cancellation, the required **CI gate**,
and timing measurements. Standalone feature pushes no longer start duplicate CI;
open a PR or manually dispatch full CI on the branch.

## Pull request coverage reports

The **Coverage report** Actions job publishes a summary on CI runs, including failures (cancelled runs skip reporting). Coverage also appears
in one bot comment on the PR, updated on reruns. Open the PR's Checks tab, then
that job/run summary for the persistent fallback. It shows unit
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
exit status. The coverage fixture has a separate 60-second budget, and source-map
collection requests share a 15-second abort deadline so they do not consume the
test's timeout. Unit coverage is also generated on assertion failures, and the
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
- The production publication suite drives the authenticated editor and inspects public HTTP responses. Client coverage is collected only when explicitly enabled; server coverage remains unavailable. API test counts are never presented as code coverage.
- Zero-denominator metrics and missing source maps are unavailable, not 100%.

The summary compares each metric with a retained compatible artifact from a
successful `main` or `develop` push CI run for the **first parent of the tested PR merge commit** (the previous SHA on
main push runs). The reporting checkout fetches that parent explicitly, avoiding
stale base SHAs from the event payload. No code from that baseline is executed. First rollout, missing or
expired artifacts, read permission failures and incompatible report formats show
`baseline unavailable`. Changes are percentage points; loaded-file denominators
can change between commits, so inspect detailed reports when interpreting deltas.

The CI workflow uses read-only permissions, isolated local Supabase, and disabled
external mail/webhooks. Build validation uses placeholder credentials. Reporting
uses `actions: read` only to retrieve baselines. A separate **Coverage PR comment**
workflow runs after CI completes and has `pull-requests: write` only to create or
update the comment. It performs no checkout or dependency install. It loads only the reporter files
from an immutable commit on this repository's trusted default (`develop`) branch through GitHub's API,
downloads artifacts into a separate temporary data directory, and never executes
PR or artifact code.
It works for fork PRs without granting their test jobs write permission, uses no
`pull_request_target`, and keeps the job summary as a fallback if publishing fails.

The publisher validates the current PR head and tested merge commit, refuses
cancelled/stale runs, and preserves a newer run/attempt's report. Serialized
publishers and a bot-owned marker prevent duplicate comments. Artifact strings
are escaped before rendering Markdown; missing artifacts remain unavailable.
The publisher upgrade activates once its workflow and scripts land on the trusted default branch.
Fork workflow execution may still require maintainer approval, and artifact access
requires GitHub access to the run.

### Local commands and configuration

```bash
pnpm run test:coverage
E2E_COVERAGE=1 pnpm run test:e2e
E2E_COVERAGE=1 pnpm exec playwright test --config=e2e/analytics.config.ts
E2E_COVERAGE=1 pnpm exec playwright test --config=e2e/oauth-ui.config.ts
# Build with the same disposable database and disabled integrations first:
pnpm run build
E2E_COVERAGE=1 E2E_PRODUCTION=1 pnpm exec playwright test e2e/browser/publication-pages.spec.ts --project=browser
pnpm exec playwright show-report playwright-report/main
node --test scripts/coverage/*.test.mjs
```

Run unit coverage before E2E when retaining both locally: Vitest cleans its own
`coverage/` directory. Each E2E run only replaces its own suite's reports.
`e2e/reporting.ts` resolves report paths from the repository location, independent
of the calling directory; `e2e/coverage/options.ts` controls source
filtering; `scripts/coverage/report.mjs` renders the CI summary. Coverage collection
is opt-in locally and enabled in the full-stack and isolated browser CI jobs. No external coverage service or
additional repository secret is required.

## Logout verification

`pnpm exec vitest run __tests__/api/signout.test.ts __tests__/lib/auth/signout.test.ts __tests__/lib/auth/signout-client.test.ts __tests__/lib/auth/use-signout.test.tsx`
checks explicit scopes, bounded expired-token refresh/revocation retry, chunk and
verifier cleanup, returned/thrown/network/timeout
errors, warning messages, duplicate activation and cancelled editor navigation.

`pnpm exec playwright test --config=e2e/logout.config.ts` runs the real Next.js
logout controls, route, login warnings and subsequent private-access checks on
desktop and mobile. It forces loopback synthetic Auth/database responses, disables
external integrations and uses a separate `.next-logout-ui` cache. It needs no
Supabase database or seeding. These tests cover provider outages, blocked app
requests and expired chunked cookies with successful refresh or refresh outages, but do not
prove live Auth revocation.

`pnpm exec playwright test e2e/api/signout.spec.ts --project=api` verifies real
local/global session revocation against the dedicated migrated Supabase E2E
project described above. It creates and removes disposable accounts, checks
post-logout private API/dashboard denial, and verifies whether a second session
can refresh. Never run it against production; disable external mail/webhooks.

## Password policy verification

Run `pnpm exec vitest run __tests__/features/profile/actions.test.ts __tests__/components/profile/ChangePasswordForm.test.tsx __tests__/auth` for runtime password/nonce validation, legacy current-password support, original-session updates, email delivery failures, retry/resend, and recovery/MFA boundaries.

Run `pnpm exec playwright test e2e/browser/password-policy.spec.ts e2e/browser/password-recovery.spec.ts --project=browser` against the dedicated local stack with `E2E_MAILPIT_URL` set. The policy suite requires Docker for its fixture that ages only a disposable session beyond 24 hours. The default container is `supabase_db_nextjs-blog-cms`; set `E2E_AUTH_DB_CONTAINER=supabase_db_cms-issue104` only for that separate isolated local stack. Remote URLs and other container names are rejected. The suite verifies real Auth password enforcement and nonce/replay behavior, browser validation bypass, security notifications, and normal/MFA recovery under secure password change. See [hosted password policy rollout](../features/password-recovery.md#deployment-requirements-and-verification) for deployment settings and leaked-password protection requirements that local tests cannot prove.

## MFA recovery verification

`pnpm exec vitest run __tests__/auth/mfa-controls.test.tsx __tests__/auth/mfa-authorization.test.ts __tests__/lib/proxy.test.ts __tests__/components/profile/TwoFactorSetup.test.tsx`
checks factor-loading errors/retry, challenge errors, expired challenges, error classification,
concurrent submissions, factor selection, enrollment cancellation and multi-factor removal.

`pnpm exec playwright test --config=e2e/mfa.config.ts` runs the real Next.js MFA page
on desktop/mobile with a loopback synthetic Auth service. It tests retry without
navigation, fresh challenges after expiry, rapid Enter, factor selection, actionable
help, sign-out and an SDK-issued synthetic AAL2 session accepted by the server proxy
after navigation and reload. It uses `.next-mfa-ui`, no database or seeding, and
disables mail, webhooks and analytics. CI runs it in the isolated auth group; its failures
and traces appear in the E2E job and `test-results/mfa` artifacts. It does not collect
code coverage or contribute to the four existing E2E coverage-summary suites.

For real Auth, retain `e2e/browser/smoke.spec.ts` (MFA enrollment/login) and
`e2e/api/mfa-assurance.spec.ts` (AAL1 denial, verified enrollment and AAL2 access)
against the dedicated disposable project described above. Synthetic tests do not
establish live TOTP verification, hosted Auth rate-limit behavior or production
configuration. See [MFA operations](../features/mfa.md).

## Login and registration credentials

Run `pnpm exec vitest run __tests__/auth/credentials-actions.test.ts __tests__/auth/credentials-forms.test.tsx __tests__/auth/register-actions.test.ts __tests__/auth/oauth-controls.test.tsx`
for malformed/repeated FormData, bypassed browser validation, normalization,
length limits, legacy login passwords, neutral provider errors, rejected
requests, duplicate submissions and retry with retained input. These tests mock
Auth and make no database or external mail calls; they do not verify hosted
Auth configuration or real provider account-enumeration behavior.

## Client auth provider verification

Run `pnpm exec vitest run __tests__/auth/auth-provider.test.tsx` for delayed
profile responses after logout/account switch, batched A → B → A transitions,
unmount and Strict Mode cleanup, initialization/event ordering, synchronous
callbacks, same-user event query counts, explicit refresh, returned/rejected
failures, missing rows, deadlines, late-event recovery, manual retry and stable
context notifications on parent rerenders. The tests render the real
provider and hooks with controlled Auth/profile responses, including responses
that ignore cancellation. They use no database, external mail or webhooks.

The provider and exported hooks are included in unit coverage. These tests do not
establish live SDK event ordering, hosted Auth behavior or production performance.
See [client auth state](../features/client-auth-state.md) for the consumer contract.

## Authentication abuse controls

Set an independent test-only `AUTH_ABUSE_HMAC_KEY` of at least 32 characters in
`.env.e2e`. For local production builds also set `AUTH_TRUSTED_IP_HEADER=x-forwarded-for`
only on the isolated loopback Next.js server; hosted deployments need the trusted
ingress setup described in [auth abuse controls](../features/auth-abuse-controls.md).
Leave both Turnstile keys empty for normal isolated suites; use the provider's test
keys only on designated bot-check deployments. No production credentials or mail.

CI runs `database/tests/auth_abuse.sql` and
`node database/tests/auth-abuse-concurrency.mjs` on its migrated disposable stack.
The concurrency check reserves shared budgets from 40 independent connections and
cleans up its own random fixtures. Unit coverage includes guard ordering, canonical
IPs, spoofing, HMAC privacy, provider 429s, CAPTCHA escalation and cooldown retries.

## Homepage reader experience

Run `pnpm exec playwright test --config=e2e/homepage.config.ts` for the homepage
introduction, reader navigation, skip link, search focus restoration, newsletter
anchor and subscription UI at 320, 390, 768 and 1280 pixels. The suite uses a
loopback synthetic content server and an intercepted newsletter response, disables
external integrations, and uses `.next-homepage-ui`. It performs no real database
writes or email delivery. Screenshots and traces appear in `test-results/homepage`.

The introduction copy is a positioning hypothesis for issue #92. Representative
reader feedback remains required; the engineering learning paths belong to #95.
The primary “Explore articles” link points to the existing `/blog` archive until
an editorially curated starting destination exists.

Homepage fixtures include eight topic tags to check that mobile navigation leads
straight into the feed, while Topics stays available from 768px. The supplemental
right rail appears from 1280px to preserve article width on tablets. Archive-link
checks use the same scoped, exact accessible-name locator as the main smoke suite.

## Public search metadata

Run `pnpm exec vitest run __tests__/app/public-metadata.test.ts __tests__/features/posts/archive-range.test.ts __tests__/app/sitemap.test.ts __tests__/app/robots.test.ts __tests__/features/authors/page.test.tsx` for canonical pagination, article previews and complete published-only sitemap discovery. Run `pnpm exec playwright test --config=e2e/seo.config.ts` for rendered browser/crawler HTML, local social fallback images and sitemap consistency. The standalone suite uses a read-only loopback synthetic Data API and `.next-seo-ui`, disables external services, and performs no database writes. See [search indexing operations](../operations/search-indexing.md) for production and Search Console checks.

## Image dialog and upload reuse

Run `pnpm exec playwright test --config=e2e/image-dialog.config.ts` for the isolated
shared cover/inline component and real Tailwind CSS. It checks long filenames at
1280, 390 and 320 pixels, short viewports, dismissal/keep/discard, keyboard focus,
URL insertion and file failure/retry/reuse feedback. Upload responses are fixtures;
this harness has no database, mail or production access.

On a disposable migrated database, run `database/tests/post_media_dedup.sql` and
`database/tests/post_media.sql` with `psql -v ON_ERROR_STOP=1`. Run
`node database/tests/post-media-concurrency.mjs` only against the designated
`supabase_db_nextjs-blog-cms` local test container. It creates/removes its own owner
and media rows and exercises 20 independent connections. API unit tests cover
content hashing, renamed identical files, distinct same-name images, retry paths,
offline indexing readiness, ownership filters and storage failures. Run
`node --test scripts/backfill-post-media.test.mjs` for resumable batch hashing,
missing-object markers, transient failures and dry-run behavior. The full upload/storage
flow remains covered by `e2e/browser/post-media.spec.ts` on a dedicated test stack.

## Comment reactions

See [comment reaction verification](../features/comment-reactions.md#migration-and-verification)
for focused unit, desktop/mobile control, database-policy, concurrency and live
article action checks. Isolated browser fixtures do not require Auth or database
access; SQL and real-action E2E tests require the dedicated disposable stack.

## Release automation

Run `pnpm run release:test` for offline Release Please generation, PR reuse, publication planning and retry checks. These tests use the real pinned library with in-memory GitHub responses and cannot publish a production release. See [release verification and hosted limits](../operations/releases.md#safe-verification-and-upgrade-checks).

## Article reactions

See [article reaction verification](../features/article-reactions.md#migration-and-verification)
for unit, disposable database/concurrency, isolated desktop/mobile and full-stack browser checks.

## AI retirement and retained settings (#209)

Run `pnpm exec playwright test --config=e2e/retirement.config.ts` for inert HTTP tombstones without a database or live provider. Run `pnpm exec playwright test --config=e2e/ai-settings.config.ts` for the actual Settings page on desktop/mobile against synthetic loopback Auth and Data API responses. These isolated tests cannot establish hosted Auth behavior or deployed RLS. Run the retained main browser suite against a dedicated migrated Supabase stack for real save/publication/media/settings coverage. Provider verification uses SDK mocks; no paid generation or live credential probe is part of normal tests.

## Bulk post actions

Run `pnpm exec vitest run __tests__/features/posts/bulk-actions.test.ts __tests__/components/PostTable.bulk.test.tsx __tests__/components/PostTable.search.test.tsx`
for per-ID authorization, bounded input, mixed statuses, optimistic concurrency,
partial results, confirmation/cancellation and duplicate submission checks.

`pnpm exec playwright test --config=e2e/bulk-posts.config.ts` checks the real table
and dialog on desktop/mobile with isolated action/router responses, keyboard
checkboxes, retry selection and pagination refresh. It makes no database calls.
For actual Next.js actions and database changes, run
`pnpm exec playwright test e2e/browser/bulk-posts.spec.ts --project=browser` against
the dedicated migrated database described above. This verifies mixed unpublish,
content/working-copy preservation, stale-row retry and emptied-page recovery.

CI also runs `database/tests/bulk_post_retention.sql` after migrations to verify
that deletion preserves retired AI provenance and chats, removes linked working
copies, and rejects another author's deletion. All fixtures are rolled back.

## Signup onboarding

See [onboarding verification](../features/onboarding.md#verification) for focused unit, disposable SQL and real desktop/mobile signup, resume, retry and completion checks. The main established-author fixture is exempt; fresh-account tests own onboarding coverage.

The isolated auth-abuse and SEO fixtures use distinct loopback ports 15496 and
15494, respectively, below Linux's usual ephemeral port range. This avoids the
54996 bind collision observed in both CI groups; keep fixture server, test control
URLs and application environment URLs synchronized when changing these ports.

## Editor link dialog

Run `pnpm exec playwright test --config=e2e/link-dialog.config.ts` for the real
TipTap toolbar and shared dialog on desktop and mobile, without Auth, database,
or external services. Coverage includes selection preservation, whole-link updates
from a caret, URL validation, cancellation/dismissal, keyboard focus, and 320px layout.

The Link action accepts absolute `http`, `https`, and `mailto` URLs, matching the
public renderer. It prefills an existing link; a caret inside a link updates that
whole link, while a text selection changes only the selected text. With an empty
selection outside a link, Apply inserts the URL as linked text. Cancel, Escape,
backdrop and close-button dismissal leave content unchanged. Focus returns to the
Link toolbar button. If content changes while the dialog is open, reopen it before
applying to avoid modifying a stale selection. The stale-document alert remains
visible and disables Apply without marking the URL field invalid. The image and
link dialog suites share `e2e/dialog-harness-config.ts` and its Vite configuration.

## Owner-only media library

See [library verification](../features/post-images.md#library-verification) for the
unit, disposable database, upgrade, concurrency and isolated browser commands.
`pnpm exec playwright test --config=e2e/media-library.config.ts` uses real dashboard
and editor components with local HTTP fixtures; it makes no Auth, database or mail
requests. It runs in the isolated harness CI group. Library request authorization is
also included in the shared MFA API matrix.

`pnpm exec playwright test e2e/browser/media-library.spec.ts --project=browser`
uses the dedicated full-stack environment above for actual upload/storage,
metadata editing, editor reuse, public URL preservation after archive, and author/admin
cross-owner HTTP denial. The main browser CI project discovers this test automatically.

## Editor videos

See [video verification](../features/post-videos.md#verification) for URL security,
serialization, persistence boundary and isolated desktop/mobile browser checks.

## Dashboard Posts navigation

Run `pnpm exec vitest run __tests__/components/Sidebar.test.tsx __tests__/lib/permissions.test.ts`
for role visibility, submenu state, direct routes and active-child semantics.
Run `pnpm exec playwright test --config=e2e/posts-navigation.config.ts` for the real
sidebar and Tailwind styles on desktop/mobile, keyboard disclosure, child navigation
and refresh. This isolated harness stubs Next navigation and sign-out, uses no Auth
or database, and does not establish deployed authorization. CI runs it in the
isolated harness group. Existing server page/action permission checks remain in place.

## Comment write protection

Run `pnpm exec vitest run __tests__/features/comments/actions.test.ts __tests__/components/CommentForm.test.tsx`
for validation parity, safe errors, request IDs and draft retention. The existing
`pnpm exec playwright test --config=e2e/comment-reactions.config.ts` also checks the
real comment form at desktop/mobile sizes: whitespace and Unicode length,
rate-limit recovery, lost responses, stable IDs and rapid pending submissions.
Actions are local HTTP fixtures; no database, mail or webhooks are used.

On the designated disposable migrated stack, run `database/tests/comment_writes.sql`
with `psql -v ON_ERROR_STOP=1` and `node database/tests/comment-writes-concurrency.mjs`.
CI runs both, along with the existing reaction policy/concurrency checks. See
[comment protection](../features/comment-writes.md) for limits and rollout.

## Pages persistence

Run `pnpm exec vitest run __tests__/features/pages __tests__/lib/permissions.test.ts`
for document validation, action guards, retry/error mapping and read boundaries.
CI runs `database/tests/pages.sql` (rolled back) and
`node database/tests/pages-concurrency.mjs` against its disposable migrated
Supabase database. They exercise anonymous/author/admin/MFA access, direct-write
denial, snapshot isolation, stale saves/publication, retry identity and real
multi-connection create/save/publish/slug races. See [Pages verification](../features/pages.md#verification)
for local target restrictions. Run `pnpm exec playwright test --config=e2e/page-editor.config.ts` for the real
page editor and shared renderer with isolated media fixtures. It checks serialized
reload, structural editing/history, keyboard/drag ordering, bounded settings, image
metadata and mobile stacking/overflow. No Auth or database is used by this harness;
SQL assertions exercise real persistence separately. Full dashboard/public URL
flows remain #288/#289.
