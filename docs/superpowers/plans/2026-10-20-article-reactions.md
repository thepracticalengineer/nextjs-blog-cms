# Article Reactions Implementation Plan

**Goal:** Implement issue #153 on `feat/153-article-reactions`, then open a PR against main.

**Approved design:** Multiple independent reactions per reader/article: Love 💖, Unicorn 🦄, Mind blown 🤯, Celebrate 🙌, Fire 🔥. Aggregate means total reactions. Guests can inspect the picker; choosing opens a login/create-account modal without writing. Authentication returns to the article; no automatic reaction. Counts update after saves and refresh on focus/every 30 visible seconds. Unpublication hides/disables reactions, republication restores them, deletion cascades. No ranking, notifications, analytics, or comment behavior changes.

**Architecture:** Dedicated article-reaction domain and table, aggregate RPC and explicit desired-state mutation RPC. Preserve session/MFA checks and private profiles. Use existing Base UI dependencies and dialog/button components. Client reads bypass the serialized action queue; identity changes isolate private selections and stale responses.

**Tech Stack:** Next.js 16.4.2, React 19.3.1, Supabase/Postgres, Base UI, Vitest, Playwright; Node 24.21.0 and pnpm 10.29.3. No new dependencies.

## Review focus

- Retried writes must not toggle state or duplicate rows.
- Account changes and late reads/writes must not leak selections or overwrite saved state.
- Publication changes must serialize with reaction writes.
- Nested picker/login focus must return correctly on Escape and close.
- Unavailable counts must not be presented as an authoritative zero.

## Tasks

- [x] Storage: add rolled-back SQL assertions first and observe missing RPC failure; implement `article_reactions`, private budgets, `get_article_reactions(uuid)` returning counts/selections or null for unavailable articles, and `set_article_reaction(uuid,text,boolean)`; assert authorization, privacy, independent types, retries, invalid input, MFA, lifecycle, budget and cascades. Add concurrency verification and CI invocation.
- [x] Boundary: add action/client tests and observe failure; implement runtime schemas, server actions and direct browser reads, update database types. Reuse existing session identity hook without modifying comment behavior.
- [x] UI: add failing component tests; implement client state with serialized writes, deadlines, stale-read guards, account isolation, reconciliation/retry, focus/visibility/poll refresh; implement compact Base UI picker and guest dialog. Integrate server-loaded snapshot into public article with Suspense.
- [x] Verification: add desktop/mobile Playwright harness for toggling, persistence, keyboard, modal focus/close/Escape, errors and touch sizes. Document migration/behavior in canonical docs. Run SQL/concurrency, unit suite, typecheck, lint, docs checks, production build and browser tests.
- [x] Review and delivery: fresh whole-branch review, resolve actionable findings, verify final changes, commit/push and create/attach PR against main with `Closes #153`.

## Execution record

- User explicitly authorized implementation of the preceding suggestion and PR creation; proceed inline without another design approval.
- Branch created from freshly fetched `origin/main`; initial tree clean.

- Storage RED: SQL assertions failed on missing `get_article_reactions`; GREEN: migration applied and rolled-back assertions pass on disposable local DB. Concurrency script passes duplicate retries, independent types, competing writes, 12-reader totals, removal and publication locking.
- Boundary/UI RED: new modules absent; GREEN: 41 targeted unit tests, including visible-only polling, pass. Initial full suite exposed server-only imports in two article-page suites; added a section mock at the existing RSC test boundary.
- Isolated browser harness required browser-safe Next environment definitions and an exact session-hook alias; eight desktop/mobile tests pass. Mobile picker and modal screenshots inspected.
- Verification: full coverage run passes 122 files / 1,654 tests; statements 91.84%, branches 86.36%, functions 92.33%, lines 95.05% (new feature included in coverage collection). Lint, typecheck, docs checker/regressions, SQL/concurrency and production build pass. Existing comment UI regression checks: eight pass.
- Fresh whole-branch reviewer found no substantive actionable issues. Accessibility pass added decorative-icon hiding and reaction-anchor scroll margin.
- A separate `cms-153-e2e` stack on loopback ports 56321/56322 applies every migration cleanly. Real Next dev/Auth/PostgREST/article integration passes login, multi-type writes, reload, guest counts/modal and removals; fixtures cleaned by teardown. Production build + real `next start` verification also passes (1 test, 6.0 seconds).
- Ruling: keep article reaction storage/state separate; reuse the established session identity hook without altering comment behavior. No new dependencies or production mutations.
- Final verification and review passed; temporary E2E stack/environment removed. Delivery targets `main` with `Closes #153`.
