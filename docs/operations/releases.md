# Numbered releases

Release Please prepares a release PR for the root application on eligible merges
to `main`. Maintainers review and merge that PR to publish a matching `vX.Y.Z` tag
and GitHub Release. There is no npm publication step. Release PRs remain open as
more eligible changes arrive; do not maintain multiple release PRs for `main`.

## Initial setup

Before merging the automation, a repository administrator must:

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
   its short-lived token at job completion. The workflow's `GITHUB_TOKEN` has no
   permissions and is not used for release writes.
3. Enable Actions and allow the two SHA-pinned actions used in
   [the release workflow](../../.github/workflows/release-please.yml). If App
   credentials are missing, the workflow fails with a setup message; it does not
   silently fall back to `GITHUB_TOKEN`.
4. Enable an active `main` branch ruleset requiring PRs, a human approval, and
   successful **Lint**, **Unit Tests**, **Build**, **API and Browser Tests**, and
   **Coverage report** checks from the CI workflow. Confirm the exact check names
   on a completed PR. Do not grant the release App a ruleset bypass or permission
   to approve/merge its own PR. Apply any tag rules so the App can create `v*`
   tags, while protecting existing tags from changes/deletion. If enabling signed
   commits, verify the App's generated commits satisfy the rule before rollout.
5. Coordinate the Conventional Commit/PR title enforcement and squash defaults in
   [issue #192](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/192).
   Prefer squash merging and set the squash commit title to the PR title. Retain
   breaking-change footers in the resulting main commit. Until enforcement lands,
   maintainers must check the final main commit message themselves.

At investigation time, classic branch protection was absent and the existing
repository ruleset was disabled. This PR does not change hosted repository rules,
create an App, or install credentials; administrators must complete these steps.
The existing Actions “Allow GitHub Actions to create and approve pull requests”
setting concerns `GITHUB_TOKEN`; this workflow authenticates as the installed App
and does not use it to approve PRs.

### Why an App token

Normal `pull_request` CI runs for App-created release PRs, including synchronization
updates, without granting the release workflow access to PR code. Existing CI
already targets PRs into `main`, including the release branch. Its push branch
filters do not need to include the release branch.

Current GitHub documentation allows `GITHUB_TOKEN`-created PRs to generate
approval-required runs for `opened`, `synchronize`, and `reopened`. Other token
created events remain restricted. We use an App so checks start automatically;
do not replace the token with `GITHUB_TOKEN` and assume equivalent behavior.
See [GitHub's event restrictions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
and [App token action](https://github.com/actions/create-github-app-token).

## Baseline and first release

The existing application version **1.0.0** is recorded in
[the manifest](../../.release-please-manifest.json). It is a version baseline, not
a claim that a historical tag/release exists. We deliberately do not publish or
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

Conventional Commits on `main` determine the next version; when squash merging,
this is the final squash commit, not every intermediate branch commit.

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

1. Merge reviewed changes with valid Conventional Commit messages. The release
   workflow runs on pushes to `main`; it opens or updates one release PR.
2. Review its proposed version, changelog, package/manifest agreement, migration
   notes, and normal CI results. Keep the generated branch/title/body and
   `autorelease: pending` label intact. Do not merge another release PR while a
   merged one is awaiting publication.
3. Merge the release PR after human review. Its push to `main` runs the same
   workflow, which publishes `vX.Y.Z` at **the release PR's merge commit**, even
   if additional commits have reached `main`. Release notes come from the
   generated PR notes that also populate the changelog.
4. Confirm tag/version/SHA/notes agree in GitHub Releases and the release PR has
   `autorelease: tagged`. A subsequent run with no new eligible work is a no-op.

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
actual Release Please **17.6.0** library, matching the bundle in the pinned action
**v5.0.0**. All GitHub operations use a fail-closed in-memory fixture: no token,
network client, real PR, production tag, release, database or deployment is used.
Tests cover generated version/changelog/manifest, breaking and hidden types,
bootstrap exclusion, stable PR updates, merge-commit publication, subsequent
versions, no-op reruns, failed publication, and recovery after partial publication.
Workflow tests also check event scope, token permissions, pinned actions, and
existing PR CI integration. Run the normal docs, lint, typecheck and unit checks.

When upgrading the action, inspect its lockfile/bundle and update the pinned test
library alongside it, then rerun these checks. The standalone CLI is available as
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
