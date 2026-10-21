# Contributing

Contributions are welcome. To contribute:

1. Fork the repository
2. Create a focused branch from `develop` using the conventions below
3. Commit your changes with meaningful, focused Conventional Commit messages
4. Open a Pull Request against `develop` — describe what changed and why

For significant changes, open an issue first to discuss the approach.

Use the pinned Node/pnpm versions, focused branches, and preserve unrelated changes. Run checks appropriate to the changed behavior and describe validation in the PR. Update canonical guides with behavior/setup changes. Commit `package.json` and `pnpm-lock.yaml` together; use `pnpm add` rather than generating npm lockfiles. Review dependency scripts in `pnpm-workspace.yaml`; do not bypass strict peers. See [dependency management](../dependency-upgrade.md) and [agent instructions](../../AGENTS.md).

## Branch, commit and PR conventions

Choose the branch name before starting work. Agent branches use
`<type>/<issue-number>-<short-kebab-case-description>`, for example
`chore/192-contribution-conventions`; without an issue, use
`<type>/<short-kebab-case-description>`. Use only `feat`, `fix`, or `chore`
as the branch type; do not use `codex/` for new branches. Honor an explicit user-requested name and
preserve existing branches and unrelated work rather than automatically renaming
them. Other contributors may keep existing branch conventions. CI accepts
`feat/**`, `fix/**`, and `chore/**`, the existing `feature/**` pattern,
and legacy `codex/**` branches for compatibility; PR CI targets both `develop` and `main` regardless of
source branch. There is no branch-name rejection check.

Commit messages and PR titles use `<type>(optional-scope): <imperative description>`.
Supported types are `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`,
`ci`, `chore`, and `revert`. Choose the type from the actual change, never to
force a release. Examples:

- `feat(comments): add single-level replies`
- `fix(auth): preserve return navigation`
- `ci(release): configure release automation`

Keep commits focused and meaningful. Update the final PR title to match its final
scope. The **PR title** check validates syntax, a nonempty single-line description,
and supported types; reviewers assess imperative wording and whether the type
matches the change. Editing the title reruns the check. It fetches current PR
metadata, uses only read permission, and never checks out or executes contributor
code, including for fork PRs.

Mark breaking changes with `!` before the colon (for example
`feat(api)!: remove legacy response`) and/or a `BREAKING CHANGE:` footer. Explain
the impact and migration in the PR body and final commit body. A title check
cannot verify commit footers or migration completeness; reviewers must preserve
them during merge. For footer-only breaking changes, explicitly include the
footer in the squash commit body. See [release version selection](../operations/releases.md#version-and-changelog-policy).

Squash ordinary PRs into `develop`: the validated PR title becomes the final commit title.
Promote `develop` into `main` and synchronize `main` into `develop` with **Create a merge commit**; never squash or rebase these PRs.
Production hotfixes into main require a `fix:` title and an explicit
`production-hotfix` label; an ordinary fix branch name alone is insufficient.
See [branch promotion](../operations/branch-promotion.md) for production hotfixes and conflict recovery. Intermediate branch commits need not all be conventional when squash
merging; do not rewrite useful history merely to satisfy this policy. If using
another merge method, maintainers must inspect the resulting main commit messages
for compatibility with release automation.

Dependabot is configured to emit `chore(deps): ...` (including dependency groups).
Release Please emits `chore(main): release X.Y.Z`. Both pass the same check;
there are no actor-based exemptions. Configure other bots to use supported types.

### Maintainer settings

The metadata-only title and branch-policy workflows run from the trusted base
branch. Require **PR title** and **PR branch policy**, alongside normal CI, on
both long-lived branches after the workflows reach each branch.

Enable squash and merge commits repository-wide, disable rebase merging, set
`squash_merge_commit_title=PR_TITLE` and `squash_merge_commit_message=PR_BODY`.
Keep breaking-change footers in the final squash body. Require merge commits on
`main`; allow squash and merge on `develop` because synchronization needs merge
commits. GitHub's destination-branch rules cannot distinguish feature from sync
PRs into `develop`; reviewers must choose the correct method. A PR check cannot
control a future merge-button selection. Do not require linear history on either
branch. See the [maintainer rollout checklist](../operations/branch-promotion.md#maintainer-rollout-checklist)
for exact checks, reviews, workflow ownership, and configuration still required.

Run `node --test scripts/conventions/*.test.mjs` to verify accepted/rejected
titles, breaking markers, bot titles, metadata isolation, events and branch CI
compatibility. CI runs these checks with documentation validation.

# Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you agree to uphold a respectful and inclusive environment. Report unacceptable behavior to the project maintainer.

## CI and merge verification

Open a PR to start automatic CI for ordinary feature branches; standalone feature
pushes do not duplicate it. Manual CI dispatch runs full validation on the chosen
branch. See the [CI matrix](ci.md) for content-based lightweight paths and the
required **CI gate**, **PR title**, and **PR branch policy** checks. Select squash
for ordinary develop PRs, merge commits for promotion/sync/recovery, and inspect
failed post-merge ancestry audits before another promotion or release. Hosted
ruleset changes remain a maintainer rollout task.
