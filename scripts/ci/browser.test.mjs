import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groups, runGroup } from './browser.mjs'
test('a failed isolated suite does not suppress later suites or hide failure', () => {
  const configs = []
  const status = runGroup('auth', (_cmd, args) => { configs.push(args.at(-1)); return { status: configs.length === 1 ? 1 : 0 } })
  assert.equal(status, 1)
  assert.deepEqual(configs, groups.auth.map(suite => `--config=e2e/${suite}.config.ts`))
  assert.equal(runGroup('harness', () => ({ status: 0 })), 0)
  assert.throws(() => runGroup('__proto__'), /Unknown/)
})
test('every isolated group records its complete suite outcomes for artifact inventory', () => {
  const reports = []
  runGroup('content', () => ({ status: 0 }), report => reports.push(report))
  assert.equal(reports.length, 1)
  assert.equal(reports[0].group, 'content')
  assert.deepEqual(reports[0].suites.map(suite => suite.name), groups.content)
  assert.ok(reports[0].suites.every(suite => suite.exitCode === 0))
})
