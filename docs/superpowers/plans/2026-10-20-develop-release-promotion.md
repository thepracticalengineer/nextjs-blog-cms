# Develop release promotion implementation plan

**Goal:** Implement issue #215 on the existing 1.1.0 release baseline.

**Architecture:** Ordinary PRs target develop; promotions and stable releases target main. An App-authenticated workflow maintains a single main-to-develop PR without writing either branch. Metadata-only policy checks restrict main PR sources. Hosted rules and Vercel isolation remain explicit administrator rollout steps.

**Specification:** GitHub issue #215 and the investigation in this chat.

## Tasks

- [x] Expand CI/title/coverage support to both branches, with regressions for develop and untrusted sources.
- [x] Add source policy and synchronization workflows with fail-closed API fixtures for reruns, no-op, concurrent develop updates, duplicate creation, and conflicts.
- [x] Verify actual Release Please commit traversal against synthetic merge history, including repeated promotions and release/sync metadata.
- [x] Update canonical contribution/release/deployment docs, AGENTS, PR template, ownership and rollout checklist; retain release state.
- [x] Run release/policy/coverage/docs tests, lint, typecheck and unit tests; review diff and prepare the branch for a PR against develop.

## Review focus

Never execute PR code with App credentials. Never push/force-push/reset develop. Compare against current refs on reruns; main as PR head updates naturally. Avoid sync loops after promotion-only merge commits. Report merge conflicts and unknown mergeability without declaring success. GitHub merge-method rules apply to destination branches: develop needs both squash and merge, so source-dependent choice remains a reviewer obligation. Require checks/approval/ownership in hosted rules before enabling automation. Never publish a test release or access a production database.

The history regression exposed upstream Release Please #1533; the release runner now uses the pinned library with an exact local Git ancestry range, retaining upstream commit/PR parsing and failing closed on incomplete history. Hosted protections/environment isolation remain explicit rollout steps; no production changes are performed by this branch.
