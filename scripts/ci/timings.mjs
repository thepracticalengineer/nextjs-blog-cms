import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const seconds = (start, end) => start && end ? Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000) : null

export function summarizeTimings(run, jobs) {
  const completed = jobs.filter(job => job.started_at && job.completed_at)
  return {
    id: run.id, event: run.event, branch: run.head_branch, sha: run.head_sha, attempt: run.run_attempt, conclusion: run.conclusion,
    runnerSeconds: completed.reduce((sum, job) => sum + seconds(job.started_at, job.completed_at), 0),
    elapsedSeconds: completed.length ? (Math.max(...completed.map(job => Date.parse(job.completed_at))) - Math.min(...completed.map(job => Date.parse(job.started_at)))) / 1000 : null,
    note: 'Job elapsed time, not billed minutes. Elapsed span includes gaps between jobs; queue time before the first job is excluded. Skipped/pending work is not a successful benchmark.',
    jobs: jobs.map(job => ({ name: job.name, conclusion: job.conclusion, seconds: seconds(job.started_at, job.completed_at), steps: (job.steps ?? []).map(step => ({ name: step.name, conclusion: step.conclusion, seconds: seconds(step.started_at, step.completed_at) })) })),
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [repo, ...ids] = process.argv.slice(2)
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !ids.length || ids.some(id => !/^\d+$/.test(id))) throw new Error('Usage: node scripts/ci/timings.mjs owner/repo RUN_ID [RUN_ID ...]')
  const api = path => JSON.parse(execFileSync('/usr/bin/gh', ['api', path], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }))
  for (const id of ids) {
    const run = api(`repos/${repo}/actions/runs/${id}`)
    let jobs = [], page = 1
    while (true) {
      const response = api(`repos/${repo}/actions/runs/${id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page++}`)
      jobs.push(...response.jobs)
      if (response.jobs.length < 100) break
    }
    console.log(JSON.stringify(summarizeTimings(run, jobs)))
  }
}
