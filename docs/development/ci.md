# CI events, validation and rollout

Issue [#228](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/228)
reduces duplicate validation while retaining security and publication coverage.

## Event and check matrix

| Event/change | Validation | Coverage |
| --- | --- | --- |
| PR into develop: application, dependencies, lockfiles, workflows, configuration, migrations, infrastructure, unknown or mixed files | Full | Unit and four existing client suites |
| develop → main promotion | Full, even if its diff looks like documentation or release metadata | Full |
| Production fix/... PR into main | Full | Full |
| PR containing only README.md and/or docs/**/*.md | Documentation, policy, classifier/gate regressions and offline release checks | Intentionally omitted |
| PR with verified release metadata only, including a main → develop sync | Same lightweight checks plus semantic metadata validation | Intentionally omitted |
| Sync/recovery PR containing application changes or substantive conflict resolutions | Full | Full |
| Push to main or develop, including release/sync merges | Full | Exact-commit comparison baseline |
| Standalone feature/fix/chore push | No automatic CI; open a PR or manually dispatch CI on the branch | None until validation runs |
| Manual CI dispatch on any branch | Full | Full; not eligible as a push baseline |

PR events include edits and ready-for-review transitions as well as opening,
synchronizing and reopening. Retargeting must reclassify the new merge/base;
title/body edits conservatively rerun validation too, rather than reusing a
lightweight result from another target. No workflow path filter can leave a
required workflow pending. Classification
examines the actual tested merge's first-parent diff, with renames disabled so
both old and new paths are considered. Missing ancestry or unreadable data selects
full validation. Only the exact root README and Markdown under docs qualify as
documentation; AGENTS.md, executable examples and unknown files require full CI.

Release metadata permits only package.json, .release-please-manifest.json and
CHANGELOG.md. Both JSON files must be present and valid: the package changes only
its stable version, and the one-entry root manifest matches both old/new versions.
A lockfile, dependency, script or other package-field change selects full CI.
Actor, title, label and branch names never establish metadata safety. The
promotion/hotfix branch guards can only force more validation. Sync labels do
not bypass content classification.

## Jobs and cancellation

Full validation runs **Lint**, **Unit Tests**, **Build**, **Database integration
and security**, **Full-stack API and publication**, three **Isolated browsers**
groups (`harness`, `auth`, `content`), and **Coverage report**. Build starts after
classification, independently of lint/unit tests. Database assertions and
full-stack tests each own a separate disposable Supabase instance on different
runners. Mail, provider generation and external webhooks remain disabled.

The browser groups run in parallel on separate runners with fail-fast disabled;
within a group, suites run serially and all run even if an earlier suite fails.
This avoids port/cache collisions and preserves failure evidence. The full-stack
job retains the actual Auth, API, browser and post-build publication tests.
No retirement, MFA, privacy, retention, concurrency or browser test was removed.
External Developer API retirement does not retire internal API/security tests.

**CI gate** runs with `always()` and checks every job result. Full mode requires
all jobs to succeed; lightweight mode accepts only the explicitly omitted
expensive jobs, while classification, lightweight checks and reporting must
succeed. Failures, cancellations, missing results and unexpected skips fail the
gate. Coverage reporting does not replace the unit test's 80% thresholds.

CI concurrency includes the event and PR number; a new run cancels only an older
run for that same PR. Push/manual runs have unique run IDs and are not cancelled
by PR updates. Release Please, promotion, sync and comment-publisher concurrency
groups remain separate and serialized. Do not add release/sync jobs to CI's
cancellation group.

## Coverage and artifact compatibility

Full-stack and browser jobs upload unique `e2e-reports-*` artifacts even after
failure. Coverage report downloads/merges them and republishes `e2e-reports` for
the existing PR publisher. Suite paths are unique, and each isolated group writes a visible JSON outcome
manifest even when successful suites have no screenshots. Reporting explicitly
checks all four expected split artifact names and fails if one is missing.
Original artifacts remain
available if aggregation fails. Missing reports stay unavailable; aggregation
failure fails reporting and the gate. Coverage summaries retain separate `main`,
`analytics`, `oauth` and `publication` client coverage, without averaging them.
Other isolated suites retain their existing failure attachments/reporting scope.

Lightweight summaries explicitly say coverage was **intentionally omitted**,
ignore stale metrics, and store null metrics with their validation mode. They
cannot become a meaningful coverage baseline. Baseline discovery still accepts
only a successful main/develop push for the exact comparison SHA, with seven-day
retention. Pushes always run fully, so lightweight PRs do not create gaps in
post-merge baselines. Failed/missing collection is distinct from a classified
omission. Existing stale-head/attempt checks protect PR comments.

The privileged comment publisher downloads data only, performs no checkout or
installation, and loads reporter modules from one immutable commit on the
trusted repository default branch (`develop`). This lets reporting upgrades
activate after their reviewed develop merge rather than waiting for production
promotion. Protect develop and require review of these scripts/workflows.

## Hosted rollout

### Copilot workflow retirement

Issues [#217](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/217)
and [#218](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/218)
were audited on October 28, 2026. Copilot code review (workflow `247293082`)
has 50 historical runs; Copilot cloud agent (`264568052`) has three. Both last
ran on April 22, 2026. Neither has repository workflow YAML on main or develop,
and no Copilot-specific configuration files were found under `.github/`.

The repository's automatic code review page showed **No rulesets**. The sole
repository ruleset was disabled and contained no review or status-check rules;
main and develop had no classic branch protection. No open PRs, Copilot-assigned
open issues, or active agent sessions (with the author filter removed) were
present. These observations establish no current dependency on either workflow;
they do not replace the separate branch-protection rollout below.

Applied through GitHub settings:

- Repository Copilot code review: MCP tool use and custom instructions **Off**;
  **Block reviews requested with an external Copilot license On**. Copilot
  approvals were already disabled by the organization. No automatic review
  ruleset was created. This external-license restriction is not a universal
  prohibition on reviews using organization-provided licenses.
- Repository cloud agent: **Allow automations Off**. Workflow approval and
  security validation controls were preserved.
- Organization cloud-agent repository access: changed from **All repositories**
  to **Selected repositories**, excluding this CMS and preserving the other
  existing repository's access. Future repositories now require explicit opt-in.
- Repository MCP configuration was already empty; no secrets, environments,
  historical runs, branches, or PRs were deleted.

GitHub's supported workflow-disable endpoint returned HTTP 422,
`Unable to disable this workflow.`, for both dynamic workflow IDs. Their Actions
entries remain `active` in the API despite the settings cleanup. Preserve these
historical entries; do not delete runs to hide them or add replacement YAML.
Recheck GitHub's controls if support for disabling these dynamic workflows changes.

CI, coverage reporting, PR title/branch policy, merge ancestry audit,
release/promotion/synchronization, Dependabot, and the issue #65 toolchain
follow-up remain active. Before cleanup, ordinary CI run
[40653443159](https://github.com/thepracticalengineer/nextjs-blog-cms/actions/runs/40653443159)
passed. After cleanup, [PR #297](https://github.com/thepracticalengineer/nextjs-blog-cms/pull/297)
triggered [CI run 40655771656](https://github.com/thepracticalengineer/nextjs-blog-cms/actions/runs/40655771656),
PR title, PR branch policy, and Vercel preview checks. This confirms PR event
delivery; consult the linked checks for their final outcomes. Offline tests
alone do not establish hosted check delivery.

### Required branch protection rollout

Repository files cannot activate hosted rulesets. Maintainers must apply these
changes alongside rollout; no App bypass or new credentials are needed:

1. Create active rulesets targeting **refs/heads/main** and **refs/heads/develop**.
   The previously disabled, untargeted `branch-protection` ruleset is insufficient.
   Require PRs, at least one human approval, code-owner review, resolved
   conversations, block deletions and force pushes. Keep automatic branch deletion
   disabled. Do not require linear history on either branch.
2. Require **CI gate**, **PR title**, and **PR branch policy**, using GitHub Actions
   as their expected check source. After a completed rollout run confirms the
   names, replace the former individual requirements **Lint**, **Unit Tests**,
   **Build**, **API and Browser Tests**, **Coverage report** with this gate. Do not
   require skipped expensive jobs or matrix-specific names individually.
3. Keep **Merge ancestry audit** informational/post-merge: it runs after a PR
   closes and must not be a pre-merge required check. Subscribe to failed Actions
   runs. Follow its recovery guidance before further promotion/release activity.
4. Enable merge commits and squash repository-wide; disable rebase. Set main's
   allowed PR merge method to **merge**. Develop must permit **merge and squash**:
   ordinary PRs squash, while sync and reviewed recovery PRs merge. Destination
   rules cannot distinguish those sources; maintainer selection remains required.
   Never enable a squash-only or linear-history develop rule.
5. Keep Release Please on main, Vercel Production Branch main, minimal App-token
   permissions, and release/sync serialization. Verify new check delivery on a
   real PR and merge without publishing a synthetic production release.
6. Do not force develop into the shared main head to satisfy a strict up-to-date
   rule on sync PRs. Refresh and review tested PR merge results as documented in
   [branch promotion](../operations/branch-promotion.md#conflict-recovery).

## Timing baseline and comparison

Read-only baseline on October 21, 2026; each row is one successful CI attempt.
Seconds are completed job elapsed time, **not billed minutes**. Runner totals
exclude queue time; adding jobs can reduce latency while increasing runner cost.

| Run / event | Lint | Unit | Build | Integration/browser | Reporting | Total runner seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [39450315570 feature push](https://github.com/thepracticalengineer/nextjs-blog-cms/actions/runs/39450315570) | 53 | 99 | 58 | 815 | 13 | 1038 |
| [39450338376 feature PR](https://github.com/thepracticalengineer/nextjs-blog-cms/actions/runs/39450338376) | 44 | 81 | 62 | 860 | 20 | 1067 |
| [39453577077 promotion PR](https://github.com/thepracticalengineer/nextjs-blog-cms/actions/runs/39453577077) | 44 | 64 | 40 | 638 | 9 | 795 |
| [39554736620 main push](https://github.com/thepracticalengineer/nextjs-blog-cms/actions/runs/39554736620) | 33 | 95 | 51 | 849 | 11 | 1039 |
| [39554755567 sync PR](https://github.com/thepracticalengineer/nextjs-blog-cms/actions/runs/39554755567) | 48 | 98 | 52 | 610 | 11 | 819 |
| [39555435206 release PR](https://github.com/thepracticalengineer/nextjs-blog-cms/actions/runs/39555435206) | 39 | 97 | 52 | 858 | 12 | 1058 |

Release/sync automation is a separate baseline: [Release Please 39554736612,
attempt 2](https://github.com/thepracticalengineer/nextjs-blog-cms/actions/runs/39554736612)
used 33 runner seconds; [sync 39557239968](https://github.com/thepracticalengineer/nextjs-blog-cms/actions/runs/39557239968)
used 12; [promotion preparation 39557258843](https://github.com/thepracticalengineer/nextjs-blog-cms/actions/runs/39557258843)
used 7. Their event scopes, concurrency and token permissions are unchanged.

The feature push/PR pair tested the same source SHA and consumed 2105 runner
seconds combined. Removing the push avoids its 1038 seconds in that example;
this is an observed duplicate cost, not a guarantee for future runs.

In the cited promotion job: setup/install 36s, collection regression 11s,
analytics 7s, Supabase startup 77s, SQL/concurrency assertions 16s, main API/browser
309s, production-build publication 27s, remaining isolated suites 147s. Remaining
time is upload/cleanup/runner overhead. SQL assertions are valuable but are not
the main latency cost. Splitting duplicates Supabase startup across two runners;
measure that cost rather than assuming parallelism saves runner minutes.

Reproduce per-job **and per-step** evidence with read-only Actions access:

```bash
node scripts/ci/timings.mjs thepracticalengineer/nextjs-blog-cms 39453577077
# Supply baseline and implemented run IDs together to compare:
node scripts/ci/timings.mjs thepracticalengineer/nextjs-blog-cms BASELINE_ID IMPLEMENTED_ID
node --test scripts/ci/*.test.mjs scripts/promotion/*.test.mjs scripts/coverage/*.test.mjs
```

Only compare successful completed attempts. Record the tested SHA, event, mode,
runner total and elapsed span. Compare full PR latency, duplicate-push absence,
lightweight omissions, and post-merge push baseline availability separately.
Queue/runner contention and dependency/image caches vary. Hosted docs/metadata,
release, promotion and synchronization events require observation during normal
rollout; offline tests cannot prove GitHub event delivery or rule enforcement.
No test production release is needed or permitted for benchmarking.

The full-stack job also runs `e2e/onboarding.config.ts` against the disposable Supabase stack on desktop and mobile, including local Mailpit confirmation. Its artifacts are in `test-results/onboarding/`; it does not contribute to the four coverage-summary suites. The database job runs the rolled-back `database/tests/onboarding.sql` privacy and completion assertions.
