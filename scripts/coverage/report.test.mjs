import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReport, metric, totals } from './report.mjs'

const identity = { sha: 'abc', head: 'def', run: '123', attempt: '2', url: 'https://github.com/org/repo/actions/runs/123' }
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'coverage-report-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, write(path, value) { const file = join(root, path); mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, JSON.stringify(value)) } }
}
const summary = pct => ({ total: Object.fromEntries(['lines','statements','branches','functions'].map(key => [key, { total: 20, pct }])) })
test('missing metrics, reports and baselines are explicit, including zero denominators', t => {
  const { root } = fixture(t)
  const { markdown } = createReport({ root, identity })
  assert.match(markdown, /Baseline unavailable/)
  assert.match(markdown, /suite did not produce a report/)
  assert.match(markdown, /artifact unavailable/)
  assert.equal(totals({ total: { lines: { total: 0, pct: 100 } } }).lines, null)
  assert.equal(metric(null, 90), 'unavailable')
  assert.equal(metric(80, null), '80.00% (baseline unavailable)')
})
test('separates suites, counts final outcomes, renders deltas and links to this attempt', t => {
  const f = fixture(t)
  f.write('unit/coverage-summary.json', summary(85))
  f.write('e2e/coverage/e2e/analytics/coverage-summary.json', summary(70))
  f.write('e2e/coverage/e2e/analytics/status.json', { status: 'passed', counts: { passed: 5, failed: 0, skipped: 1, flaky: 2 }, coverage: 'collected', errors: 0 })
  const { markdown, snapshot } = createReport({ root: f.root, identity, baseline: { schema: 1, scope: 'loaded-client-v1', sha: 'base', unit: totals(summary(80)), e2e: { analytics: totals(summary(75)) } }, artifacts: { unit: '456', e2e: '789' } })
  assert.match(markdown, /85.00% \(\+5.00 pp\)/)
  assert.match(markdown, /70.00% \(-5.00 pp\)/)
  assert.match(markdown, /analytics \| 5 \| 0 \| 1 \| 2/)
  assert.match(markdown, /attempt 2/)
  assert.match(markdown, /runs\/123\/artifacts\/789/)
  assert.equal(snapshot.e2e.analytics.lines, 70)
  assert.equal(snapshot.e2e.main.lines, null)
})
test('failed collection remains visible but cannot become a comparison baseline', t => {
  const f = fixture(t)
  f.write('e2e/coverage/e2e/main/coverage-summary.json', summary(50))
  f.write('e2e/coverage/e2e/main/status.json', { status: 'failed', coverage: 'incomplete', errors: 1, counts: { passed: 2, failed: 1, skipped: 3, flaky: 0 } })
  const { markdown, snapshot } = createReport({ root: f.root, identity })
  assert.match(markdown, /incomplete \/ failed/)
  assert.match(markdown, /main \| 2 \| 1 \| 3 \| 0/)
  assert.equal(snapshot.e2e.main.lines, null)
})
test('invalid summaries cannot fabricate percentages or inject Markdown tables', t => {
  const f = fixture(t)
  f.write('unit/coverage-summary.json', summary('100% | injected'))
  f.write('e2e/coverage/e2e/main/status.json', { coverage: '<script>\n|bad [click](https://evil.invalid) @everyone', counts: { passed: -1 } })
  const { markdown } = createReport({ root: f.root, identity, artifacts: { unit: 'javascript:bad' } })
  assert.doesNotMatch(markdown, /<script>|javascript:bad|100% \| injected|@everyone|\[click\]/)
})
for (const mode of ['docs', 'metadata']) test(`${mode} omission is explicit and cannot fabricate coverage or a baseline`, t => {
  const f = fixture(t)
  f.write('unit/coverage-summary.json', summary(99))
  const { markdown, snapshot } = createReport({ root: f.root, identity: { ...identity, validationMode: mode } })
  assert.match(markdown, /intentionally omitted/)
  assert.doesNotMatch(markdown, /99.00%/)
  assert.equal(snapshot.validationMode, mode)
  assert.equal(snapshot.unit.lines, null)
  assert.equal(snapshot.e2e.main.lines, null)
})
