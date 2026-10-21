async function getOrCreatePull({ github, scope, pending }) {
  const pulls = await pending()
  if (pulls.length > 1) throw new Error('Multiple develop-to-main PRs exist; reconcile them manually.')
  if (pulls.length === 1) return pulls[0]
  try {
    const { data } = await github.rest.pulls.create({ ...scope, base: 'main', head: 'develop',
      title: 'chore(promotion): promote develop to main',
      body: 'Promote the current develop batch to production. This PR follows develop automatically.\n\nReview all commits, required checks, and production migration prerequisites before merging. Use **Create a merge commit**; never squash or rebase a promotion. Keep breaking-change declarations on the individual feature/fix commits.\n\nMerging deploys through Vercel and lets Release Please prepare the version/changelog PR on main. Review the subsequent main-to-develop synchronization PR. See docs/operations/branch-promotion.md. Automation never merges or resolves conflicts.',
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
export async function promote({ github, core, owner, repo, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const scope = { owner, repo }
  const pending = async () => (await github.paginate(github.rest.pulls.list, {
    ...scope, state: 'open', base: 'main', head: `${owner}:develop`, per_page: 100,
  })).filter(pr => pr.head.ref === 'develop' && pr.head.repo?.full_name === `${owner}/${repo}`)
  const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({ ...scope, basehead: 'main...develop' })
  // A synchronization merge can add ancestry without new content. Avoid empty cycles.
  if (comparison.ahead_by === 0 || comparison.files?.length === 0) {
    core.notice('No promotion needed: develop is contained or adds no file changes.')
    return { status: 'unchanged' }
  }
  if (!Array.isArray(comparison.files)) throw new Error('GitHub comparison omitted files; cannot decide safely.')
  const pendingPr = await getOrCreatePull({ github, scope, pending })
  const pr = await pollMergeability({ github, scope, number: pendingPr.number, wait })
  const attention = pr.mergeable !== true
  const message = `Promotion PR #${pr.number}: ${pr.html_url}. ${attention ? 'Conflicts or unknown mergeability require human resolution; rerun after recovery.' : 'Review checks and merge with a merge commit.'}`
  await core.summary.addRaw(message).write()
  if (attention) core.setFailed(message)
  else core.notice(message)
  return { status: attention ? 'attention' : 'open', number: pr.number }
}
