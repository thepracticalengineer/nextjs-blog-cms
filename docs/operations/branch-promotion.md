# Develop promotion and synchronization

Ordinary work integrates on `develop`; `main` is the production branch and the
only stable Release Please source. GitHub's default branch is `develop`. Retain
Vercel Git integration with **Production Branch = main** explicitly.

## Daily flow

1. Branch from current `develop`: `feat/<issue>-<description>`,
   `fix/<issue>-<description>`, or `chore/<issue>-<description>` (issue optional).
   Open ordinary PRs against `develop`; squash merge using the validated
   Conventional Commit PR title and retain breaking-change footers in the body.
2. Test previews using a separate non-production database with external mail and
   webhooks disabled. See [deployment configuration](../setup/deployment.md#develop-previews-and-production).
3. Apply required production [migrations](../setup/migrations.md) before promoting
   dependent code. Pause newsletter dispatch for its handoff migration. Review
   the full batch, migration compatibility, and CI.
4. Open this repository's `develop` → `main` PR titled
   `chore(promotion): promote develop to main`. Merge with **Create a merge commit**.
   Never squash or rebase a promotion: preserve feature/fix squash commits for
   SemVer and changelog generation. Keep the promotion title/body non-breaking;
   put release-driving messages on individual feature/fix commits.
5. Review the App-created Release Please PR on `main`, then merge it with a merge
   commit. Confirm the stable tag, release SHA, notes and version agree. Preserve
   the generated branch/title and `autorelease: pending` label.
6. Review the automated `main` → `develop` PR titled
   `chore(sync): merge main into develop`; merge with **Create a merge commit**.
   Do not delete `main` or `develop` after merging. Never rebase/reset/force-push
   either branch. Disable repository automatic head-branch deletion so neither
   long-lived source is removed before protections are established.

The promotion deploys application changes immediately through Vercel; the release
PR merge causes another deployment. Release publication does not certify deployment
success. Use [deployment verification](deployment-verification.md) separately.
One-approval, release-only production deployment is outside this flow.

## Production hotfixes

Create a `fix/...` branch from current `main` for an urgent production repair.
Open a reviewed PR against `main`, use a valid `fix:` title, and have a maintainer
apply the **production-hotfix** label to explicitly designate the production path.
An ordinary `fix/...` PR without that label must target develop. Run all required
checks, and merge with a merge commit. The branch policy rejects ordinary feature,
chore and fork PRs into `main`. The hotfix push opens or updates the same sync PR;
merge it back into `develop` with a merge commit. A subsequent patch release uses
the regular human-reviewed release PR. Avoid implementing a second copy of the
hotfix independently on develop.

## Automation and merge policy

CI, title validation and coverage support both long-lived branches. The
**PR branch policy** check reads current API metadata from trusted base code;
it never executes contributor code. It accepts same-repository develop promotions,
`fix/...` hotfixes explicitly labeled `production-hotfix` with a `fix:` title, and the installed release App's expected metadata-only release
PR into main. The release App identity is `the-practical-engineer-releases[bot]`;
a replacement App requires updating the policy and tests in a reviewed PR.
Fork feature contributions remain supported into develop.

Synchronization runs on every main push and manual dispatch on main. It compares
current `develop...main`, reuses a pending same-repository main-to-develop PR,
and creates one if needed. Using main directly as the head means subsequent main
commits update the PR naturally without a temporary branch, reset or force push.
Job writes are serialized; creation races re-read the existing PR. Main already
contained in develop is a no-op. An ancestry-only promotion with no file changes
is also a no-op, preventing empty promotion/sync cycles. Existing redundant PRs
are left for human closure. API failures fail the job; unknown mergeability is
retried briefly then reported as requiring attention. Conflicts retain the PR and
fail the run with a link and recovery guidance. There is no automatic merge.

The sync workflow executes only the immutable main event commit, installs no
dependencies, and uses the existing release App credentials with a token narrowed
to **Contents read / Pull requests write**. It cannot update refs or create tags.
The installed App retains its existing release permissions; no new workflow-write,
Actions-write, administration permission or ruleset bypass is needed. App-created
PRs receive ordinary CI without relying on `GITHUB_TOKEN` event exceptions.

Enable squash and merge repository-wide; disable rebase. A main ruleset can allow
merge commits only. Develop must allow both squash and merge: GitHub rulesets
select destination branches and cannot distinguish feature from sync sources into
the same branch. **Reviewers must select squash for ordinary develop PRs and merge
for sync PRs.** The metadata check cannot control a future merge-button selection.
Do not claim complete source-dependent merge-method enforcement. A future exclusive
merge broker would require separate design and privileges.
See [GitHub rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).

## Conflict recovery

1. Keep the sync PR open. Fetch current main/develop and inspect the conflict.
2. Branch from current develop as `chore/<issue>-sync-recovery`. Merge main into
   that branch locally, resolve deliberately, and run relevant checks. Never
   resolve by discarding concurrent develop work or by rewriting main/develop.
3. Open a recovery PR against develop, link the sync PR, obtain review and merge
   with a merge commit. This is a narrowly scoped exception to ordinary squash
   policy so main ancestry is preserved. Do not push recovery commits to main.
4. Close the now-redundant sync PR if GitHub has not already closed it. Rerun
   **Synchronize develop** on main; it should report no synchronization needed.

If develop advances while a sync PR is open, GitHub recomputes the merge against
its latest head. Re-review stale approvals and run checks on the current merge.
Do not enable a strict up-to-date requirement that would force merging develop
back into the shared main head merely to update a sync PR; use fresh PR merge
checks/reviews and re-run CI when the base changes. No linear-history requirement
belongs on either long-lived branch.

## Maintainer rollout checklist

Read-only audit on October 20, 2026: both branches exist at
`6e999ca0a27331ad0a3b34d8d3889263396487f1`, matching published `v1.1.0`;
GitHub default is develop; release App variable/secret exist and release PR #208
received CI. Both branches are unprotected and the existing ruleset is disabled.
Merge/squash/rebase are enabled; squash title default is COMMIT_OR_PR_TITLE.
There are no open PRs to retarget at that snapshot. These are observations, not
claims that this PR changes hosted settings.

- [x] Retain existing develop baseline, release tags, version 1.1.0, changelog,
  manifest, bootstrap SHA, and release App credentials. Never reinitialize them.
- [x] Default branch is develop. New ordinary PRs and Dependabot updates use it;
  scheduled workflows run from the default branch. Existing local tracking refs
  may still name main: fetch and intentionally base new work on origin/develop.
- [ ] Merge this PR into develop after validating push CI. The old trusted-base
  title workflow excludes develop, and the new policy does not exist there yet:
  bootstrap review is manual. Confirm both metadata checks on a subsequent PR.
- [ ] Promote these workflows/docs to main with a reviewed merge commit. Run full
  CI on that PR; inspect the trusted-base policy's first run after rollout.
- [ ] Create the repository label **production-hotfix** for intentional urgent
  main-targeted fixes. Label addition/removal revalidates the branch policy;
  a fix branch name alone never designates a production repair.
- [ ] In repository merge settings: enable squash and merge, disable rebase,
  disable automatic head deletion, set squash title **Pull request title** and
  body **Pull request description**. Preserve footers during final review.
- [ ] Activate protections for **both** branches: require PRs, at least one human
  approval, dismiss stale approvals, resolve conversations, block force pushes
  and deletion, and require code-owner review. Do not require linear history or
  branch-up-to-date updates to the shared sync head. Restrict main to merge
  commits; develop allows squash and merge with the reviewer policy above.
- [ ] Require exact check names **Lint**, **Unit Tests**, **Build**,
  **API and Browser Tests**, **Coverage report**, **PR title**, and
  **PR branch policy**, after observing them on real PRs. Bind checks to the
  GitHub Actions App where supported. Retain any separately agreed Sonar/Vercel
  checks. Do not add broad App/admin bypasses or let bots approve their own PRs.
- [ ] Verify `.github/CODEOWNERS` resolves to an eligible maintainer. Protect
  workflow, automation, release config, ownership and contribution-policy changes
  through required code-owner review on both branches. Reviewers must understand
  App credential boundaries. Human review is still required for release/sync PRs.
- [ ] Existing `RELEASE_APP_CLIENT_ID` variable and `RELEASE_APP_PRIVATE_KEY`
  secret suffice. Check repository-only App installation and accepted Contents,
  Issues and Pull requests permissions. Never paste keys into chat. Keep existing
  tag protection, allowing only release creation without moving/deleting tags.
- [ ] Verify Vercel **Production Branch = main**, Git integration active, and
  develop/feature previews enabled. The connector audit exposed a ready production
  deployment but not branch settings or environment isolation.
- [ ] Configure Preview/develop credentials, separate non-production database,
  Auth URLs and disabled mail/webhooks. Check overrides; do not copy production
  credentials. Verify a safe preview and PR run before relying on automation.
- [ ] Rehearse the full flow in a disposable repository with a separate App
  installation and no production deployment integration. Test promotion, release,
  sync, hotfix, reruns, concurrent develop activity, no-op and conflicts. Never
  publish a test release or run database tests in this production repository.

If open PRs appear during transition, retarget ordinary ones to develop and rerun
CI/review against the new base. Preserve intended hotfix/release targets on main.
For in-flight branches based on main, fetch and merge develop deliberately or
recreate a focused branch without overwriting useful existing work. Avoid running
old workflows from a stale default branch after changing settings.

## Safe verification

Run `pnpm run release:test`, `node --test scripts/promotion/*.test.mjs`, the
convention/coverage tests, and documentation checks. Release tests exercise pinned
Release Please 17.6.0's real GraphQL parser, paginated commit iterator and manifest
planning against synthetic API history: individual promoted feature/fix commits
appear once; release/sync/promotion metadata alone does not bump; a hotfix produces
a patch. Synchronization tests use fail-closed API fixtures and disposable local
Git histories. They never authenticate, modify this repository's refs, deploy,
create hosted tags or access databases. They do not prove real GitHub event delivery,
hosted event delivery, rules or Vercel isolation. The release ancestry adapter
additionally reproduces the upstream chronological-cutoff bug using both synthetic
API history and real disposable Git commits dated before the last release. Validate those
in the disposable hosted rehearsal before enabling the complete process.
