# Signup Onboarding Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task.

**Goal:** Complete issue #146 for future accounts while exempting existing users.
**Architecture:** Owner-private onboarding state, transactional saves, shared post-auth destination resolution and a dashboard wizard.
**Tech Stack:** Existing Next.js App Router, Supabase Postgres, React, shadcn, Vitest and Playwright. No new packages.
**Spec:** [Design](../specs/2026-10-22-signup-onboarding-design.md)

## Global constraints
- Node 24.21.0 and pnpm 10.29.3.
- Keep MFA, recovery, public author privacy and CMS roles intact.
- No newsletter enrollment, username system or recommendation engine.
- Preserve unrelated next-env.d.ts changes.

## Review focus
- Account confirmed on a second device retains a validated destination.
- Missing state exempts existing accounts; failed reads do not bypass eligible accounts.
- Stale tabs cannot overwrite completion or current profile edits.
- Deleted/empty taxonomy cannot trap a user.
- MFA and password recovery take precedence over onboarding routing.

## Task 1: Persistence and validation
- [x] Add failing validation tests for required fields, unsupported roles, bounded interests, invalid destination and completion.
- [x] Run focused Vitest and confirm failures.
- [x] Generate ordered migration with CLI. Add future-account eligibility trigger, private table, ownership/assurance policies and transactional revision-checked save function.
- [x] Add rolled-back SQL tests for new/existing users, cross-user denial, direct-write restrictions, invalid tags, stale revisions and completion.
- [x] Run SQL on disposable local database and validation tests.

## Task 2: Authentication routing
- [x] Add failing tests for pending/completed/exempt destinations, read outages, MFA ordering and confirmation destination preservation.
- [x] Implement server resolver and integrate immediate signup/login, OAuth, confirmation and post-MFA/dashboard entry.
- [x] Preserve safe return semantics and recovery behavior. Store pre-confirmation destination through server-owned signup state.
- [x] Run auth regression tests.

## Task 3: Guided UI
- [x] Add failing form tests for prefill, required fields, optional skip, search/selection, saved navigation and failed-save retry.
- [x] Implement server page and authorized action plus three-step accessible form using existing UI components.
- [x] Add browser tests for desktop/mobile completion, refresh/resume, keyboard and failure retry.
- [x] Run focused form and browser checks with isolated dependencies.

## Task 4: Documentation, verification and PR
- [x] Add canonical onboarding guide describing private data, required/optional answers and migration cutoff.
- [x] Run typecheck, lint, full unit suite, docs checks and appropriate database/browser verification.
- [x] Review the whole diff, fix defects and record verification limitations.
- Publish the verified commit on `feat/146-signup-onboarding` and create/attach the PR against `develop` (final delivery step).

## Verification record

- Full unit suite: 117 files, 1,507 tests passed. Coverage: 91.63% statements, 86.22% branches, 91.44% functions, 95.32% lines.
- Six real desktop/mobile onboarding browser checks, 14 auth/taxonomy regressions, and four isolated Settings browser checks passed.
- Fresh migration replay and rolled-back onboarding/public-profile/MFA SQL assertions passed on disposable `cms-issue146`.
- Production build, typecheck, lint, docs checks/tests and 82 CI/reporting script tests passed.
- Independent code review completed; unavailable-topic navigation, name-conflict recovery, duplicate-save and expired-session cases are covered.
- Live external OAuth consent screens, hosted SMTP/configuration and the entire existing E2E suite were not exercised locally.
