# Contributing

Contributions are welcome. To contribute:

1. Fork the repository
2. Choose a focused branch using the conventions below
3. Commit your changes with meaningful, focused Conventional Commit messages
4. Open a Pull Request — describe what changed and why

For significant changes, open an issue first to discuss the approach.

Use the pinned Node/pnpm versions, focused branches, and preserve unrelated changes. Run checks appropriate to the changed behavior and describe validation in the PR. Update canonical guides with behavior/setup changes. Commit `package.json` and `pnpm-lock.yaml` together; use `pnpm add` rather than generating npm lockfiles. Review dependency scripts in `pnpm-workspace.yaml`; do not bypass strict peers. See [dependency management](../dependency-upgrade.md) and [agent instructions](../../AGENTS.md).

## Branch, commit and PR conventions

Choose the branch name before starting work. Agent branches use
`<type>/<issue-number>-<short-kebab-case-description>`, for example
`chore/192-contribution-conventions`; without an issue, use
`<type>/<short-kebab-case-description>`. Choose a meaningful type such as `feat`,
`fix`, or `chore`; do not use `codex/` for new branches. Honor an explicit user-requested name and
preserve existing branches and unrelated work rather than automatically renaming
them. Other contributors may keep existing branch conventions. CI accepts
all supported type prefixes listed below, the existing `feature/**` pattern,
and legacy `codex/**` branches for compatibility; PR CI targets `main` regardless of
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

Prefer squash merging: the validated PR title becomes the final commit title on
`main`. Intermediate branch commits need not all be conventional when squash
merging; do not rewrite useful history merely to satisfy this policy. If using
another merge method, maintainers must inspect the resulting main commit messages
for compatibility with release automation.

Dependabot is configured to emit `chore(deps): ...` (including dependency groups).
Release Please emits `chore(main): release X.Y.Z`. Both pass the same check;
there are no actor-based exemptions. Configure other bots to use supported types.

### Maintainer settings

The `pull_request_target` workflow runs from the trusted base branch, so it first
becomes active after this workflow reaches `main`. After merging it, confirm a
**PR title** check on a real PR, then
require it in an active `main` ruleset alongside the existing checks listed in
[release setup](../operations/releases.md#initial-setup). Enable required PRs and
human approval; avoid bot bypasses. A workflow alone does not prevent merging
when repository rules are disabled.

In **Settings → General → Pull Requests**, enable squash merging and set its
default commit title to **Pull request title** (`squash_merge_commit_title=PR_TITLE`).
Prefer **Pull request description** for the default body
(`squash_merge_commit_message=PR_BODY`) so migration notes and breaking-change
footers can carry through; inspect the final body before merging. Consider
disabling merge/rebase methods if maintainers want squash-only enforcement.
Repository settings are a separate administrator step, not changed by this PR.

Run `node --test scripts/conventions/*.test.mjs` to verify accepted/rejected
titles, breaking markers, bot titles, metadata isolation, events and branch CI
compatibility. CI runs these checks with documentation validation.

# Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you agree to uphold a respectful and inclusive environment. Report unacceptable behavior to the project maintainer.
