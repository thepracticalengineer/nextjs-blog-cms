import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const suites = ['main', 'analytics', 'oauth', 'publication']
const metrics = ['lines', 'statements', 'branches', 'functions']
export function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}
export function totals(summary) {
  return Object.fromEntries(metrics.map(key => {
    const value = summary?.total?.[key]
    return [key, value && Number.isFinite(value.pct) && value.pct >= 0 && value.pct <= 100 && value.total > 0 ? value.pct : null]
  }))
}
const escape = value => String(value).replace(/[|<>\r\n@\[\]()`\\]/g, ' ')
const count = value => Number.isInteger(value) && value >= 0 ? value : 'unavailable'
export function metric(value, baseline) {
  if (!Number.isFinite(value)) return 'unavailable'
  let delta = 'baseline unavailable'
  if (Number.isFinite(baseline)) {
    const sign = value >= baseline ? '+' : ''
    delta = `${sign}${(value - baseline).toFixed(2)} pp`
  }
  return `${value.toFixed(2)}% (${delta})`
}

export function createReport({ root, baseline, identity, artifacts = {} }) {
  const unit = totals(readJson(join(root, 'unit/coverage-summary.json')))
  const e2e = Object.fromEntries(suites.map(suite => {
    const status = readJson(join(root, 'e2e/coverage/e2e', suite, 'status.json'))
    return [suite, { status, metrics: totals(readJson(join(root, 'e2e/coverage/e2e', suite, 'coverage-summary.json'))) }]
  }))
  const compatible = baseline?.schema === 1 && baseline?.scope === 'loaded-client-v1' && (!identity.baseSha || baseline.sha === identity.baseSha)
  const lines = [
    '# Test coverage', '',
    `Tested commit: \`${escape(identity.sha)}\`; PR head: \`${escape(identity.head)}\`. [Run ${escape(identity.run)} / attempt ${escape(identity.attempt)}](${identity.url}).`, '',
    compatible ? `Baseline: \`${escape(baseline.sha)}\` (successful base-branch CI). Changes are percentage points.` : 'Baseline unavailable: no compatible retained successful CI report for the exact base commit.', '',
    '## Unit coverage', '', `Unit job: ${escape(identity.unitStatus ?? 'local')}.`, '',
    '| Lines | Statements | Branches | Functions |', '| --- | --- | --- | --- |',
    `| ${metrics.map(key => metric(unit[key], compatible ? baseline.unit?.[key] : null)).join(' | ')} |`, '',
    'Existing 80% thresholds remain enforced by Vitest. Coverage covers the configured include list, not the entire repository.', '',
    '## E2E client coverage', '',
    '| Suite | Lines | Statements | Branches | Functions | Collection / test run |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  for (const suite of suites) {
    const { status, metrics: values } = e2e[suite]
    lines.push(`| ${suite} | ${metrics.map(key => metric(values[key], compatible ? baseline.e2e?.[suite]?.[key] : null)).join(' | ')} | ${escape(status?.coverage ?? 'unavailable: suite did not produce a report')} / ${escape(status?.status ?? 'skipped or interrupted')} |`)
  }
  lines.push('', 'Scope: Chromium primary-page JavaScript mapped to loaded application source files. Server/API, secondary pages/contexts, workers and unloaded files are not measured. Navigation can lose earlier-page coverage. These are limited client measurements, not whole-application coverage; suite percentages must not be averaged.', '',
    '## E2E results', '', '| Suite | Passed | Failed | Skipped | Flaky |', '| --- | --- | --- | --- | --- |')
  for (const suite of suites) {
    const counts = e2e[suite].status?.counts
    lines.push(`| ${suite} | ${['passed', 'failed', 'skipped', 'flaky'].map(key => count(counts?.[key])).join(' | ')} |`)
  }
  lines.push('', '## Reports', '')
  for (const [label, id] of [['Unit HTML/JSON', artifacts.unit], ['E2E coverage, Playwright HTML/JSON and failure attachments', artifacts.e2e]]) {
    lines.push(/^\d+$/.test(String(id)) ? `- [${label}](${identity.url}/artifacts/${id})` : `- ${label}: artifact unavailable; inspect the [run logs](${identity.url}).`)
  }
  lines.push('- E2E artifact: `playwright-report/<suite>/index.html`, `test-results/<suite>/`, and `coverage/e2e/<suite>/index.html` when available.', '',
    'Reports are downloadable artifacts (7-day retention). Open the HTML locally. Missing or zero-denominator metrics are unavailable, never 0% or 100%. Failed/skipped collection does not change test exit status. Reruns publish a new attempt summary and update the coverage PR comment.', '')
  return { markdown: lines.join('\n'), snapshot: {
    schema: 1, scope: 'loaded-client-v1', sha: identity.sha, unit,
    e2e: Object.fromEntries(suites.map(suite => [suite, e2e[suite].status?.status === 'passed' && !e2e[suite].status?.errors ? e2e[suite].metrics : totals(null)])),
  } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const env = process.env
  const identity = { unitStatus: env.UNIT_STATUS, baseSha: env.BASELINE_SHA, sha: env.GITHUB_SHA ?? 'local', head: env.PR_HEAD_SHA || env.GITHUB_SHA || 'local', run: env.GITHUB_RUN_ID ?? 'local', attempt: env.GITHUB_RUN_ATTEMPT ?? '1', url: `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${env.GITHUB_REPOSITORY ?? 'local'}/actions/runs/${env.GITHUB_RUN_ID ?? 'local'}` }
  const baseline = readJson('baseline/baseline.json')
  const { markdown, snapshot } = createReport({ root: 'artifacts', baseline, identity, artifacts: { unit: env.UNIT_ARTIFACT_ID, e2e: env.E2E_ARTIFACT_ID } })
  mkdirSync('coverage-report', { recursive: true })
  writeFileSync('coverage-report/summary.md', markdown)
  writeFileSync('coverage-report/comparison.json', JSON.stringify(baseline))
  writeFileSync('coverage-report/baseline.json', JSON.stringify(snapshot, null, 2))
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, markdown)
  else console.log(markdown)
}
