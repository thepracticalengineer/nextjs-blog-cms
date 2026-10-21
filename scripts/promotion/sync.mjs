import { maintainBranchPull } from './branch-pull.mjs'

export function synchronize(args) {
  return maintainBranchPull({
    ...args,
    head: 'main',
    base: 'develop',
    title: 'chore(sync): merge main into develop',
    body: 'Bring released metadata and production hotfixes back to develop.\n\nMerge with **Create a merge commit** after review and required checks. Never squash, rebase, reset, or force-push develop. This PR follows main automatically.\n\nIf conflicts occur, follow docs/operations/branch-promotion.md#conflict-recovery. Automation never resolves conflicts or merges this PR.',
    label: 'Synchronization',
    unchangedStatus: 'synchronized',
  })
}
