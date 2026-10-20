async function getOrCreatePull({ github, scope, pending }) {
  const pulls = await pending()
  if (pulls.length > 1) throw new Error('Multiple main-to-develop PRs exist; reconcile them manually.')
  if (pulls.length === 1) return pulls[0]
  try {
    const { data } = await github.rest.pulls.create({ ...scope, base: 'develop', head: 'main',
      title: 'chore(sync): merge main into develop',
      body: 'Bring released metadata and production hotfixes back to develop.\n\nMerge with **Create a merge commit** after review and required checks. Never squash, rebase, reset, or force-push develop. This PR follows main automatically.\n\nIf conflicts occur, follow docs/operations/branch-promotion.md#conflict-recovery. Automation never resolves conflicts or merges this PR.',
    })
    return data
  } catch (error) {
    if (error.status !== 422) throw error
    const concurrent = await pending()
    if (concurrent.length !== 1) throw error
    return concurrent[0]
  }
}

// GitHub computes mergeability asynchronously. Poll sequentially, at most three
// times; a parallel request cannot observe the result of an earlier wait.
async function pollMergeability({ github, scope, number, wait }, attempt = 0) {
  const { data } = await github.rest.pulls.get({ ...scope, pull_number: number })
  if (data.mergeable !== null || attempt >= 2) return data
  await wait(2000)
  return pollMergeability({ github, scope, number, wait }, attempt + 1)
}

/** Only creates PR metadata. Never mutates refs or resolves conflicts automatically. */
export async function synchronize({ github, core, owner, repo, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const scope = { owner, repo }
  const pending = async () => (await github.paginate(github.rest.pulls.list, {
    ...scope, state: 'open', base: 'develop', head: `${owner}:main`, per_page: 100,
  })).filter(pr => pr.head.ref === 'main' && pr.head.repo?.full_name === `${owner}/${repo}`)
  const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({ ...scope, basehead: 'develop...main' })
  // A promotion merge adds ancestry but no content to bring back. Avoid empty cycles.
  if (comparison.ahead_by === 0 || comparison.files?.length === 0) {
    core.notice('No synchronization needed: main is contained or adds no file changes.')
    return { status: 'synchronized' }
  }
  if (!Array.isArray(comparison.files)) throw new Error('GitHub comparison omitted files; cannot decide safely.')
  const pendingPr = await getOrCreatePull({ github, scope, pending })
  const pr = await pollMergeability({ github, scope, number: pendingPr.number, wait })
  const attention = pr.mergeable !== true
  const message = `Synchronization PR #${pr.number}: ${pr.html_url}. ${attention ? 'Conflicts or unknown mergeability require human resolution; rerun after recovery.' : 'Review checks and merge with a merge commit.'}`
  await core.summary.addRaw(message).write()
  if (attention) core.setFailed(message)
  else core.notice(message)
  return { status: attention ? 'attention' : 'open', number: pr.number }
}
