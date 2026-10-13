import { join } from 'node:path'
import { createReport, readJson } from './report.mjs'

const marker = '<!-- codex-test-coverage -->'

async function testedCommit(github, owner, repo, headSha, root) {
  const snapshot = readJson(join(root, 'source/baseline.json'))
  if (!/^[a-f0-9]{40}$/.test(snapshot?.sha ?? '')) return { sha: 'unavailable' }
  try {
    const { data: commit } = await github.rest.repos.getCommit({ owner, repo, ref: snapshot.sha })
    if (commit.parents?.[1]?.sha === headSha) return { sha: snapshot.sha, baseSha: commit.parents[0].sha }
  } catch { /* Missing or fabricated identity remains unavailable. */ }
  return { sha: 'unavailable' }
}

/** Run from trusted default-branch code. Downloaded artifacts are data only. */
export async function publishCoverageComment({ github, owner, repo, runId, prNumber, root }) {
  if (!Number.isSafeInteger(runId) || !Number.isSafeInteger(prNumber) || prNumber < 1) throw new Error('Invalid coverage identity')
  const { data: run } = await github.rest.actions.getWorkflowRun({ owner, repo, run_id: runId })
  if (run.path !== '.github/workflows/ci.yml' || run.name !== 'CI' || run.event !== 'pull_request' || run.status !== 'completed' || run.conclusion === 'cancelled') return
  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: prNumber })
  if (pr.state !== 'open' || pr.base.ref !== 'main' || pr.base.repo.full_name !== `${owner}/${repo}` || pr.head.sha !== run.head_sha) return

  const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: prNumber, per_page: 100 })
  const previous = comments.find(comment => comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith(marker))
  const oldRun = previous?.body.match(/<!-- coverage-run:(\d+):(\d+) -->/)
  if (oldRun && (Number(oldRun[1]) > runId || (Number(oldRun[1]) === runId && Number(oldRun[2]) > run.run_attempt))) return

  const { sha: testedSha, baseSha } = await testedCommit(github, owner, repo, run.head_sha, root)
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { owner, repo, run_id: runId, per_page: 100 })
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, { owner, repo, run_id: runId, per_page: 100 })
  const artifact = name => artifacts.find(item => item.name === name && !item.expired)?.id
  const identity = {
    sha: testedSha, head: run.head_sha, baseSha, run: runId, attempt: run.run_attempt,
    unitStatus: jobs.find(job => job.name === 'Unit Tests')?.conclusion ?? 'unavailable',
    url: `https://github.com/${owner}/${repo}/actions/runs/${runId}`,
  }
  const candidate = readJson(join(root, 'source/comparison.json'))
  const baseline = baseSha && candidate?.sha === baseSha ? candidate : null
  const { markdown } = createReport({ root, baseline, identity, artifacts: { unit: artifact('coverage-report'), e2e: artifact('e2e-reports') } })
  const body = `${marker}\n<!-- coverage-run:${runId}:${run.run_attempt} -->\n${markdown}`
  // Check again after artifact processing: a new push must not get stale coverage.
  const { data: current } = await github.rest.pulls.get({ owner, repo, pull_number: prNumber })
  if (current.head.sha !== run.head_sha || current.state !== 'open') return
  if (previous) await github.rest.issues.updateComment({ owner, repo, comment_id: previous.id, body })
  else await github.rest.issues.createComment({ owner, repo, issue_number: prNumber, body })
}
