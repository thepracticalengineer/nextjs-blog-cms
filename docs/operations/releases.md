# Numbered releases

Release Please prepares a release PR for the root application on eligible merges
to `main`. Maintainers review and merge that PR to publish a matching `vX.Y.Z` tag
and GitHub Release. There is no npm publication step. Release PRs remain open as
more eligible changes arrive; do not maintain multiple release PRs for `main`.

## Initial setup

The existing release App is already configured. Preserve it and the published
`v1.1.0` release. For a new installation, a repository administrator must:

1. Create a GitHub App for release automation, install it on **this repository
   only**, and grant repository **Contents: read/write**, **Issues: read/write**
   and **Pull requests: read/write** (Metadata read is implicit). No Actions,
   administration, deployment, or workflow write permission is required. The App
   does not need webhook subscriptions. Organization policy must permit the App.
2. Add the App's **Client ID** as repository Actions variable
   `RELEASE_APP_CLIENT_ID` and its PEM private key as Actions secret
   `RELEASE_APP_PRIVATE_KEY`. Use the Client ID, not the deprecated numeric App ID.
   Never commit a private key or copy it into logs. The token action defaults to
   this repository, explicitly limits the three write permissions, and revokes
   its short-lived token at job completion. The workflow's `GITHUB_TOKEN` has only Contents read for trusted main checkout
   and is not used for release writes.
3. Enable Actions and allow the setup and SHA-pinned token actions used in
   [the release workflow](../../.github/workflows/release-please.yml). If App
   credentials are missing, the workflow fails with a setup message; it does not
   silently fall back to `GITHUB_TOKEN`.
4. Enable an active `main` branch ruleset requiring PRs, a human approval, and
   successful **CI gate** from the CI workflow (which evaluates every applicable
   full or lightweight job). Confirm the exact check names
   on a completed PR. Do not grant the release App a ruleset bypass or permission
   to approve/merge its own PR. Apply any tag rules so the App can create `v*`
   tags, while protecting existing tags from changes/deletion. If enabling signed
   commits, verify the App's generated commits satisfy the rule before rollout.
5. Apply the [contribution conventions and maintainer settings](../development/contributing.md#branch-commit-and-pr-conventions):
   require **PR title** and **PR branch policy** in active `main` and `develop` rulesets, and
   set its default title to **Pull request title** and body to **Pull request
   description**. Inspect the final commit body to retain breaking-change footers
   and migration guidance. Intermediate branch commits need not all be conventional
   when squash merging.

At investigation time, classic branch protection was absent and the existing
repository ruleset was disabled. This PR does not change hosted repository rules,
create an App, or install credentials; administrators must complete these steps.
The existing Actions “Allow GitHub Actions to create and approve pull requests”
setting concerns `GITHUB_TOKEN`; this workflow authenticates as the installed App
and does not use it to approve PRs.

### Why an App token

Normal `pull_request` CI runs for App-created release PRs, including synchronization
updates, without granting the release workflow access to PR code. CI
targets PRs into `main` and `develop`, including release and synchronization PRs. Its push branch
filters do not need to include the release branch.

Current GitHub documentation allows `GITHUB_TOKEN`-created PRs to generate
approval-required runs for `opened`, `synchronize`, and `reopened`. Other token
created events remain restricted. We use an App so checks start automatically;
do not replace the token with `GITHUB_TOKEN` and assume equivalent behavior.
See [GitHub's event restrictions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
and [App token action](https://github.com/actions/create-github-app-token).

## Baseline and first release

The original application version **1.0.0** was the bootstrap baseline.
The current [manifest](../../.release-please-manifest.json) is **1.1.0**, matching
the published `v1.1.0` release. Preserve existing version and tag history; do not
reinitialize the manifest. The original baseline was not a historical release. We deliberately do not publish or
backfill `v1.0.0`.

The exclusive `bootstrap-sha` is
`9fd450506d6a0d54ed022748d53ca31db2b79e16`, the audited `main` commit before this
implementation. Commits at or before it are excluded. Only changes after it can
enter the first generated release. For example, a `fix:` yields **1.0.1**, a
`feat:` yields **1.1.0**, and an explicit breaking change yields **2.0.0**.
The automation setup's `ci:` commit alone creates no release.

The baseline and boundary serve different purposes: the manifest establishes the
previous version; the boundary excludes old history. Do not use a permanent
`release-as` override, an empty manifest, or `last-release-sha` for initial setup.
After the first successful release, Release Please discovers the previous release
and ignores `bootstrap-sha`. It can remain as historical context.
See [upstream bootstrapping guidance](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md#bootstrapping).

## Version and changelog policy

Conventional Commits preserved on `main` determine the next version. Ordinary
PRs squash into develop; promotion merge commits retain those squash commits.
Intermediate feature-branch commits are not separate release inputs.

| Commit | Effect from 1.0.0 |
| --- | --- |
| `fix: repair navigation` | Patch: 1.0.1 |
| `perf: reduce render work` | Patch: 1.0.1 |
| `feat: add bookmarks` | Minor: 1.1.0 |
| `feat!: remove legacy routes` | Major: 2.0.0 |
| Any type with `!` or a `BREAKING CHANGE:` footer | Major; explain impact and migration |
| `docs`, `chore`, `ci`, `build`, `test`, `refactor` without a breaking change | No release by themselves; hidden from ordinary notes |
| Nonconventional messages | Not reliable release inputs; correct them before merge |

The highest applicable bump wins across unreleased changes. Reverts use upstream
Conventional Commit revert handling: a matching change/revert pair may cancel
out; do not assume every `revert:` forces a release. Breaking changes remain
visible even for otherwise hidden types. Choose types based on actual behavior,
not to force a version. A docs-only release is unnecessary; its changes still
ship through normal deployments. Review generated notes rather than assuming
all commits are represented.

The root Node strategy updates `package.json`, `CHANGELOG.md`, and the release
manifest in the release PR. Our pnpm v9 lockfile format does not store the root
package version, so a version-only bump needs no `pnpm-lock.yaml` change. CI still
runs frozen installation. Dependency changes must update the lockfile normally;
do not introduce npm lockfiles or regenerate dependencies just to bump a version.

## Maintainer workflow

1. Squash reviewed ordinary changes into `develop` with valid Conventional Commit
   messages. Open `develop` → `main` with a `chore(promotion): ...` title and merge
   using **Create a merge commit** after review and CI. The release workflow runs
   on pushes to `main`; it opens or updates one release PR.
2. Review its proposed version, changelog, package/manifest agreement, migration
   notes, and normal CI results. Keep the generated branch/title/body and
   `autorelease: pending` label intact. Do not merge another release PR while a
   merged one is awaiting publication.
3. Merge the release PR after human review. Its push to `main` runs the same
   workflow, which publishes `vX.Y.Z` at **the release PR's merge commit**, even
   if additional commits have reached `main`. Release notes come from the
   generated PR notes that also populate the changelog.
4. Confirm tag/version/SHA/notes agree in GitHub Releases and the release PR has
   `autorelease: tagged`. A subsequent run with no new eligible work is a no-op. Review the automated
   `main` → `develop` synchronization PR and merge it with a merge commit.

Runs are serialized with cancellation of running jobs disabled. The stable
release branch and upstream label/version tracking prevent recursive metadata-only
releases and repeated creation on ordinary reruns. This is not an exactly-once
transaction across all GitHub APIs; use the recovery process for partial failure.

## Releases, deployments and migrations

Vercel Git integration continues deploying merges to `main`, including the release
PR merge. This workflow does not deploy, promote, call a deploy hook, or listen to
tag/release events to add a second production deployment. Confirm `main` remains
the Production Branch in the Vercel project's Git settings.
See [Vercel Git integration](https://vercel.com/docs/git) and
[deployment configuration](../setup/deployment.md).

A numbered release marks a milestone; publication neither waits for nor certifies
Vercel deployment success. Confirm the deployed SHA and perform
[deployment verification](deployment-verification.md) separately. A Vercel rollback
changes the running deployment, not Git tags, versions or database state.

Apply [required database migrations](../setup/migrations.md) **before the application
merge that deploys dependent code**, not just before the later release PR merge.
Observe newsletter dispatch pauses and any coordinated environment/template
rollout. Release automation runs no migrations and cannot roll them back.

## Failure recovery

- **Missing credentials or permissions:** correct the App installation, accepted
  permissions, variable/secret, or repository policy. Use **Actions → Release
  Please → Run workflow → main**. Dispatch on other branches is skipped. Never
  paste a token into workflow inputs or logs.
- **No release PR:** check eligible main commit messages and bootstrap boundary,
  action logs, and merged PRs still labeled `autorelease: pending`. A pending
  merged release blocks another PR until publication finishes. Non-release
  commits alone intentionally do nothing.
- **Wrong proposed version or notes:** stop before merging. Correct the underlying
  commit metadata using supported Release Please overrides only after reviewing
  upstream documentation, then regenerate and review. Avoid editing generated
  metadata that the next run will overwrite. Never leave `release-as` pinned.
- **Publish failed before creating a release:** leave the pending label intact,
  fix the cause and rerun the workflow. No manual tag is needed.
- **Publish succeeded but comments/labels failed:** compare the existing release's
  tag, target commit and notes with the merged release PR first. Rerun: upstream
  recognizes duplicate publication, reconciles labels, and may report the
  duplicate as a failed run. A subsequent run is then a no-op. Do not delete or
  move the published tag to make the run green. If labels are incomplete, restore
  the appropriate `autorelease: pending` state and rerun only after checking the
  published release matches; escalate any mismatched tag/SHA to the maintainer.
- **Bad release already published:** preserve published tags. Correct the problem
  with a reviewed change and a subsequent version; coordinate deployment rollback
  and migration compatibility separately.

## Safe verification and upgrade checks

Run `pnpm run release:test`. It loads checked-in configuration and exercises the
actual pinned Release Please **17.6.0** library used by the release runner. All GitHub operations use a fail-closed in-memory fixture: no token,
network client, real PR, production tag, release, database or deployment is used.
Tests cover generated version/changelog/manifest, breaking and hidden types,
bootstrap exclusion, stable PR updates, merge-commit publication, subsequent
versions, no-op reruns, failed publication, and recovery after partial publication.
Workflow tests also check event scope, token permissions, pinned actions, and
existing PR CI integration. Run the normal docs, lint, typecheck and unit checks.

When upgrading Release Please, review the pinned library and its API changes,
including GraphQL history parsing, then rerun these checks. The standalone CLI is available as
`pnpm exec release-please`; its commands can write to GitHub, so any production
investigation must explicitly use `--dry-run` and must not expose credentials.
See [upstream CLI options](https://github.com/googleapis/release-please/blob/main/docs/cli.md).

Offline tests prove planning and API-boundary orchestration, not hosted App
installation, actual GitHub event delivery, ruleset enforcement or Vercel status.
After setup, verify that the first real eligible merge opens one release PR and
starts CI; then publish the first intended milestone only after human review.
For a full rehearsal, use a disposable repository with its own App installation,
synthetic history and no Vercel integration. Merge a test release PR there, verify
its SHA/tag/notes, rerun and verify no duplicate. Do not publish a test release in
this production repository.

## Two-branch rollout

Follow [develop promotion and synchronization](branch-promotion.md) for the
current flow, merge methods, hotfixes, conflict recovery, and remaining hosted
configuration. Keep Release Please on `main` only. The same installed App is used
for synchronization, with a separate short-lived token narrowed to Contents read
and Pull requests write; it never updates branch refs or merges PRs.

## Promotion history ordering

The release workflow now invokes the pinned library through
[scripts/release/run.mjs](../../scripts/release/run.mjs), rather than the action's
chronological-history wrapper. Release Please has an
[upstream history-ordering limitation](https://github.com/googleapis/release-please/issues/1533):
a newly promoted feature authored before the latest release can appear after the
release boundary in GraphQL history and be silently omitted.

The runner uses a full trusted main checkout and the exact Git ancestry range
from the highest stable release to HEAD. It retains upstream commit/PR parsing,
but orders the required commits before the boundary, deduplicates by SHA, and
fails if any required commit is missing from the API scan (bounded at 5,000).
It never rewrites commits, tags or versions. After publication, the next scan
re-reads releases and uses the new boundary. Missing history, non-ancestor releases
and stale main checkouts fail closed; rerun on current main. The final API ref
check reduces stale-run writes but cannot make GitHub's separate APIs transactional.
Keep release runs serialized and review the generated PR against current main.

All actions in the release and synchronization jobs are pinned to full commit
SHAs, including checkout and runtime setup, because earlier steps can persist
state into the later App-token steps. Git runs through `/usr/bin/git` on the
Ubuntu runner so a PATH entry cannot shadow it.

Dependency installation runs on trusted main with frozen lockfile and lifecycle
scripts disabled, before any App token is generated. The token is passed only to
the release runner step. This workflow must never check out a PR head. Both branch
protections and required code-owner reviews are prerequisites for this trust model.

## CI optimization rollout

Use the [CI event matrix and hosted checklist](../development/ci.md) when updating
required checks. Release metadata PRs can receive lightweight validation only
when their actual JSON changes are version-only; dependency/lockfile changes run
fully. Main/develop pushes remain fully validated for exact-commit coverage
baselines. Stable Release Please remains serialized on main with unchanged
publication permissions. The separate run `39554736612` failed on attempt 1 and
succeeded on attempt 2; it does not establish a CI-duration/synchronization cause.
The post-merge ancestry audit is detection, not a release-publication gate.


## Root release branch contract and issue #231 recovery

The single root application explicitly sets `component: nextjs-blog-cms` in
[the release configuration](../../release-please-config.json). Its canonical PR
head is **`release-please--branches--main--components--nextjs-blog-cms`**, even if
`package.json` is renamed. Component-free tags remain `vX.Y.Z`; pinning the branch
component changes neither published tags nor the manifest version.

The temporary legacy allowance `release-please--branches--main` introduced with
#232 is retired. At the October 21, 2026 audit there were no open legacy release
PRs; #229 and #235 had already merged from the canonical component-qualified head.
Do not rename, delete, or regenerate their branches as recovery, and do not move
published tags. #229 published v3.0.0 and #235 published v3.0.1. The original #229
policy run failed, while #235 obtained a successful main-base policy run
[39556902797](https://github.com/thepracticalengineer/nextjs-blog-cms/actions/runs/39556902797).

REST verified the installed App author as login
`the-practical-engineer-releases[bot]`, numeric ID `345175842`, type `Bot`.
The policy checks all three, same-repository source, the exact branch, a stable
`chore(main): release X.Y.Z` title, and `autorelease: pending`. Only modified
`package.json`, `CHANGELOG.md`, `.release-please-manifest.json`, or `pnpm-lock.yaml`
files are allowed; additions, deletions, renames, empty diffs and other paths fail.
Offline release tests run a real pinned-library candidate through the actual
trusted workflow script so generator/validator drift fails CI.

Deliver subsequent changes through a reviewed PR into develop and the normal
merge-commit promotion into main (or the documented maintainer-labeled production
hotfix process). A release PR head cannot update its `pull_request_target` policy.
After corrected code reaches main, trigger a **fresh** metadata event on an open,
still-pending canonical release PR, such as removing and restoring its pending
label, and inspect the new **PR branch policy** run. Rerunning an old run can reuse
old trusted workflow code. Tagged/merged release PRs no longer have the pending
label and can fail later label-triggered runs; use the pre-merge pending-state run
as evidence. Verify develop behavior on the ordinary implementation PR and main
behavior on the next intended pending release; never publish solely for testing.

The separate version investigation confirmed that squash promotion #225 copied
historical retirement `BREAKING CHANGE:` text already released in v2.0.0 into
v3.0.0's notes. Preserve those published versions and tags. Promotion/sync titles
and bodies must not carry breaking declarations: place new declarations on the
individual feature commits retained by merge-commit promotions. Policy now rejects
such PR metadata, and the runner checks the entire unreleased ancestry range
**before any publication or PR writes**, refusing contaminated promotion/sync
messages rather than guessing which breaking declarations are historical. The
already released boundary is excluded from this check. Genuine new breaking
feature commits still produce a major release.

If this preflight stops a future run, review the offending SHA and compare it with
the latest published release. Correct still-unmerged PR metadata before merging.
For metadata already in main, stop automation and prepare a separately reviewed,
evidence-backed history-handling change; neither strip all breaking text nor set
`release-as` merely to unblock CI. No published-history rewrite is authorized by
this recovery procedure.


## Historical retirement recovery

The October 24, 2026 Release Please run `40096050254` stopped at promotion
`6615f109bf4d7073b7035df4f0ffded4a9110b08` (#233). Earlier squash promotions
and syncs copied retirement declarations into new commit bodies. Subsequent
ancestry repair also made the original retirement commit reachable outside the
latest release's ancestor set. Changing a PR description after merge cannot
change these commit messages; do not reset or force-push shared history.

The release history adapter acknowledges exactly seven immutable historical
commits, after verifying that the selected published release boundary contains
v3.0.1 (`25bc3e6ceeb85fca3244964314e48c938bb4e881`):

| Commit | Historical content |
| --- | --- |
| `57d97ea68bc4ad947cc59b83ee0a2fd2df7f9769` | Sync #234, copied retirement metadata |
| `6615f109bf4d7073b7035df4f0ffded4a9110b08` | Promotion #233, copied retirement metadata |
| `6d47b66f22d22a08cb2631ee4a7acd40ed1ffd81` | Sync recovery #236, copied retirement metadata |
| `b6ad1bb93e3b4b849ef27712c01cc135ab7b2316` | Sync #227, copied retirement metadata |
| `bb4c33a559f1592a63c0f6781d08d07ed9c5698a` | Sync recovery #226, copied retirement metadata |
| `6925b7933f3734b6cf6fff4ce599e76ac75c3266` | Sync #221, copied retirement metadata |
| `e26478d14c77ecfba5b776c22e238fa5b4de1224` | Original retirement #219, already shipped in v2.0.0 |

These commits are omitted only from release calculation; Git history, files,
versions and tags stay intact. Evidence: v2.0.0's changelog records the retirement,
and `git diff e26478d v2.0.0 -- app features lib components supabase` is empty.
The copied metadata commits contain that same retirement declaration. This is
an explicit acknowledgement of this history, not a rule that ignores all chore
commits or all breaking declarations. Missing API history still fails before
filtering, and the current published boundary is always retained.

The offline fixture `scripts/release/fixtures/recovery-history.json` captures
commit messages and topological order from `v3.0.1..cf67b6d` (the failed run's
main tip). Its file lists are synthetic for the pinned library's test harness.
The regression uses the real pinned parser and manifest: this batch proposes
3.1.0, retains bulk actions and onboarding, and excludes the historical retirement.
A genuinely new breaking feature still proposes 4.0.0; a new contaminated
promotion/sync SHA still fails before writes. The onboarding PR was merged with
a merge commit, so its merge title and feature commit can both appear in notes;
this recovery does not deduplicate ordinary feature merge titles.

Deliver this recovery through a reviewed ordinary PR into develop, squash that
PR, then promote develop to main with **Create a merge commit** and a concise
non-breaking promotion description. Once the corrected runner is on main, a
fresh main dispatch can regenerate the release PR. Review its version and notes
before merging the release PR with **Create a merge commit**. Do not rerun an
old workflow revision expecting it to use the new code. No release publication
is needed to test the recovery.

For future promotions and syncs, use merge commits and short descriptions that
do not paste accumulated commit messages. If another unknown historical SHA
fails the guard, investigate it separately; do not broaden this list automatically
or use `release-as` to bypass the failure.
