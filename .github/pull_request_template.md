## Change

Describe the problem and resulting behavior. Link the issue.

## Validation

List checks run and any unavailable verification. Include migration prerequisites
and deployment ordering when applicable. Preserve breaking-change footers in the
final commit body.

## Target and merge method

- Ordinary feature/fix/chore: target **develop**, **squash** with the Conventional Commit PR title.
- Promotion: **develop → main**, title `chore(promotion): ...`, **merge commit**.
- Release: App-generated metadata PR → **main**, **merge commit**.
- Production hotfix: branch **fix/...** from main → **main**, **merge commit**; sync back.
- Synchronization or conflict recovery → **develop**, **merge commit**; never squash/rebase/reset/force-push long-lived branches.

See [branch promotion](https://github.com/thepracticalengineer/nextjs-blog-cms/blob/develop/docs/operations/branch-promotion.md).
