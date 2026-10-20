# Bulk post actions implementation plan

**Goal:** Implement issue #223 on the existing dashboard with page-scoped selection, confirmation, authorized mutations and accurate partial results.

**Architecture:** Keep selection in the keyed Posts table. A bounded server action validates unique UUIDs and expected versions, uses the cookie client and per-post ownership/role checks, and returns success/skipped/failed results. Preserve unpublish newsletter cancellation and public cache invalidation. Retain legacy AI provenance when deleting its linked post by making the reference nullable with ON DELETE SET NULL.

**Tech stack:** Existing Next.js, React, Supabase, shared Dialog/Button, native checkboxes, Vitest and Playwright.

## Tasks

- [x] Add failing server tests for validation, authorization, mixed status, concurrent changes, partial failures and warnings; implement bounded mutation action.
- [x] Add failing component tests for selection, cancellation, duplicate submission, retry and refresh; implement table controls and confirmation.
- [x] Add retention migration and database regression assertion; document deletion consequences and bulk behavior.
- [x] Run unit tests, typecheck, lint and documentation checks; run isolated database/browser checks where available, review diff, commit and open PR against develop.

## Constraints

No bulk publishing or cross-page selection. Failed rows remain selected only while visible. Navigation clears selection. Never overwrite content, working copies or slug reservations during unpublish. Deletion removes post-associated working copies using existing cascades; retired provenance records remain private and retained. No production database access.

## Verification ledger

- 1,477 unit tests across 112 files pass.
- Coverage thresholds pass: statements 91.68%, branches 86.09%, functions 91.73%, lines 95.31%.
- Six desktop/mobile browser harness checks pass.
- Production build with placeholder Supabase credentials, typecheck, zero-warning lint, documentation links and eight documentation checker tests pass.
- Migration and retention/ownership assertion pass inside one rolled-back transaction in the disposable local CMS PostgreSQL container.
- Independent code review found no actionable defects.
- Live Next.js/database browser regression is included for CI but unavailable locally: this checkout has no `.env.e2e` dedicated test configuration. Harness responses are isolated and do not validate actual server actions.
