async function getOrCreatePull({ github, scope, pending, head, base, title, body }) {
  const pulls = await pending()
  if (pulls.length > 1) throw new Error(`Multiple ${head}-to-${base} PRs exist; reconcile them manually.`)
  if (pulls.length === 1) return pulls[0]
  try {
    const { data } = await github.rest.pulls.create({ ...scope, base, head, title, body })
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
export async function maintainBranchPull({ github, core, owner, repo, head, base, title, body, label, unchangedStatus, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const scope = { owner, repo }
  const pending = async () => (await github.paginate(github.rest.pulls.list, {
    ...scope, state: 'open', base, head: `${owner}:${head}`, per_page: 100,
  })).filter(pr => pr.head.ref === head && pr.head.repo?.full_name === `${owner}/${repo}`)
  const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({ ...scope, basehead: `${base}...${head}` })
  // A promotion merge adds ancestry but no content to bring back. Avoid empty cycles.
  if (comparison.ahead_by === 0 || comparison.files?.length === 0) {
    core.notice(`No ${label.toLowerCase()} needed: ${head} is contained or adds no file changes.`)
    return { status: unchangedStatus }
  }
  if (!Array.isArray(comparison.files)) throw new Error('GitHub comparison omitted files; cannot decide safely.')
  const pendingPr = await getOrCreatePull({ github, scope, pending, head, base, title, body })
  const pr = await pollMergeability({ github, scope, number: pendingPr.number, wait })
  const attention = pr.mergeable !== true
  const message = `${label} PR #${pr.number}: ${pr.html_url}. ${attention ? 'Conflicts or unknown mergeability require human resolution; rerun after recovery.' : 'Review checks and merge with a merge commit.'}`
  await core.summary.addRaw(message).write()
  if (attention) core.setFailed(message)
  else core.notice(message)
  return { status: attention ? 'attention' : 'open', number: pr.number }
}
