import { test } from 'node:test'
import assert from 'node:assert/strict'
const { summarizeTimings } = await import('./timings.mjs').catch(() => ({ summarizeTimings: () => ({}) }))
test('timing evidence sums runner work separately from parallel elapsed time and preserves step costs', () => {
  const run = { id: 1, event: 'pull_request', head_sha: 'abc', run_attempt: 2 }
  const job = (name, start, end) => ({ name, conclusion: 'success', started_at: `2026-10-21T00:00:${start}Z`, completed_at: `2026-10-21T00:00:${end}Z`, steps: [{ name: 'test', started_at: '2026-10-21T00:00:10Z', completed_at: '2026-10-21T00:00:20Z' }] })
  const result = summarizeTimings(run, [job('a', '00', '30'), job('b', '10', '40')])
  assert.equal(result.runnerSeconds, 60)
  assert.equal(result.elapsedSeconds, 40)
  assert.equal(result.jobs[0].steps[0].seconds, 10)
  assert.equal(result.attempt, 2)
})
