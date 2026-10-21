import { maintainBranchPull } from './branch-pull.mjs'

export function promote(args) {
  return maintainBranchPull({
    ...args,
    head: 'develop',
    base: 'main',
    title: 'chore(promotion): promote develop to main',
    body: 'Promote the current develop batch to production. This PR follows develop automatically.\n\nReview all commits, required checks, and production migration prerequisites before merging. Use **Create a merge commit**; never squash or rebase a promotion. Keep breaking-change declarations on the individual feature/fix commits.\n\nMerging deploys through Vercel and lets Release Please prepare the version/changelog PR on main. Review the subsequent main-to-develop synchronization PR. See docs/operations/branch-promotion.md. Automation never merges or resolves conflicts.',
    label: 'Promotion',
    unchangedStatus: 'unchanged',
  })
}
