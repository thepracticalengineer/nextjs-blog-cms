# CI optimization implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement issue #228 without reducing regression coverage or rewriting shared history.

**Architecture:** Classify the actual tested merge diff conservatively, retain full long-lived-branch push baselines, and expose one explicit CI gate. Separate database assertions, full-stack publication/API tests, and three independent isolated-browser groups. Aggregate their artifacts before existing coverage publication. Detect incorrect promotion/sync merges using trusted metadata.

**Tech Stack:** GitHub Actions, Node 24.21.0, pnpm 10.29.3, native Node tests, Playwright, disposable Supabase.

**Spec:** GitHub issue #228 and the investigation in this chat; the user requested implementation and a PR against develop.

## Global constraints

- Preserve all integration/browser tests and 80% unit coverage thresholds.
- Never run fixtures against production or publish a test release.
- Keep stable Release Please on main, serialized release/sync writes, and private retention contracts.
- Preserve existing workspace edits and shared branch/tag history.
- Unknown changes, dependencies, configuration, workflows, migrations and application promotions receive full validation.

## Review focus

- Lightweight classification must inspect JSON content, deletions/renames and actual merge results.
- Required gate must reject unexpectedly skipped, failed and cancelled dependencies.
- Split artifacts must preserve suite identity and missing-collection visibility.
- Source-dependent merge methods cannot be guaranteed by destination rules alone.
- Squashed identical trees can still have a nonempty merge-base diff; do not hide main-only changes.

### Task 1: Event classification and gate

- [x] Add failing behavioral classifier/gate tests and workflow event assertions.
- [x] Implement strict docs/release metadata classification, PR-scoped cancellation and manual full validation.
- [x] Verify full/metadata/docs paths, invalid data, dependencies and gate result combinations.

### Task 2: Split jobs and reporting

- [x] Add failing tests pinning preserved commands, isolated suite inventory and artifact aggregation.
- [x] Extract shared setup, run DB/full-stack separately, and run isolated browser groups in parallel without fail-fast.
- [x] Preserve aggregated e2e-reports compatibility; report intentional omitted coverage explicitly and never use it as a baseline.
- [x] Run workflow, coverage and release regressions plus representative local browser validation where available.

### Task 3: Merge safeguards and evidence

- [x] Reproduce squash ancestry in a disposable Git test and test trusted post-merge detection.
- [x] Add non-destructive detection and clear merge instructions; preserve sync idempotency.
- [x] Record timing baseline, event matrix, benchmark procedure, required hosted rules/checks and recovery in canonical docs.
- [x] Run repository checks, review the complete diff, commit, push the issue branch and open a PR against develop.

## Verification record

Local verification: 1,477 unit tests and all 80% coverage thresholds, 101 isolated
browser tests across 11 suites, CI/promotion/coverage/convention regressions,
33 offline release tests, documentation checks/tests, ESLint, typecheck and a
production build passed. An independent review found a missing split-artifact
inventory check; group outcome manifests and a failing inventory regression now
cover it. Generated browser cache/config edits were removed before committing.

The implementation PR is #240 against develop. Hosted full validation and timing
comparison are recorded in that PR's checks and the implementation conversation;
post-merge event/ruleset rollout still requires normal maintainer observation.
Retarget/edit events rerun validation so a main hotfix cannot reuse a develop
lightweight check. Existing shared history and hosted settings were preserved.
