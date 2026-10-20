# Release automation implementation plan

Issue: #191. Implement in this session on `codex/191-release-automation`.

## Decisions

Use Release Please's Node strategy for the root application, with manifest baseline
1.0.0 and bootstrap boundary 9fd450506d6a0d54ed022748d53ca31db2b79e16
(the audited main commit before this implementation). Do not backfill a tag or
publish 1.0.0. Use plain vX.Y.Z tags. A repository-scoped GitHub App creates release
PRs and publishes releases so PR CI starts automatically. Missing App configuration
fails with an actionable setup message. Keep existing Vercel Git deployments.
The human release checkpoint is merging a release PR; document repository rules
needed to enforce it. #192 owns convention enforcement and squash defaults.

## Tasks

1. Add a pinned development dependency matching the Release Please action's bundled
   library. Write offline node:test fixtures using the actual Manifest/Node strategy,
   with GitHub transport replaced by a fail-closed fake. First observe missing
   configuration failure; then add manifest/config/workflow. Verify fix/feat/breaking,
   other types, history exclusion, generated version/changelog/manifest, repeated PR
   creation/update, merged PR publication SHA/tag/notes, and repeat/failed publish.
2. Add a main-only, serialized Release Please workflow with scoped App credentials,
   pinned actions, and manual recovery dispatch. Integrate offline release tests into
   existing CI. No production deployment or npm publication steps.
3. Document initial App/repository settings, baseline, conventions, migration order,
   release versus deployment, verification limits, retries and recovery in canonical
   release documentation. Link from index, contributing and deployment guidance.
4. Run frozen install, offline release tests, documentation checks, lint, typecheck,
   unit suite and workflow validation. Review the diff, commit only task files, push,
   open a PR against main, attach the PR, and report setup requirements.

## Review focus

- Baseline does not import historical breaking changes or force every release to 1.0.0.
- Bot PRs receive normal checks without privileged execution of contributor code.
- A repeated event cannot create a second release or a release from release metadata alone.
- Tags reference the merged release commit even when main has advanced.
- Publication failure can be retried without rewriting an existing release/tag.

## Verification record

Verified on Node 24.21.0 and pnpm 10.29.3:

- Frozen install: passed.
- Offline release tests: 24 passed, including subsequent-version and partial-failure cases.
- Documentation checker regression tests: 8 passed.
- Documentation paths/anchors/skills: passed for a clean task snapshot (50 docs,
  11 skills). The shared checkout check fails on concurrently introduced,
  untracked skillshare metadata/aliases; those unrelated files were preserved.
- ESLint and typecheck: passed.
- Unit suite: 119 files, 1,613 tests passed.
- Production build with placeholder Supabase credentials: passed.
- actionlint 1.7.12: passed for CI and release workflows.
- Config validation against the pinned upstream JSON schema: passed.
- Independent final review: no actionable findings.

Release tests use no credentials, network, production releases, databases, mail or
deployment actions. Hosted App/event/ruleset verification remains a rollout check;
no test release was published. No repository rules or Vercel settings were changed.
