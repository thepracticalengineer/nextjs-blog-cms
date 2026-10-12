import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const cli = require.resolve('@playwright/test/cli')
const root = resolve(import.meta.dirname, '../..')

test('real collection retains passing/failing/retry reports, excludes harnesses, and isolates reruns', { timeout: 120_000 }, t => {
  const directory = mkdtempSync(join(tmpdir(), 'e2e-coverage-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  mkdirSync(join(directory, 'lib'))
  const source = 'function choose(flag) {\n  if (flag) return 1;\n  return 2;\n}\nchoose(true);\n'
  writeFileSync(join(directory, 'lib/sample.js'), source)
  const map = { version: 3, sources: ['sample.js'], sourcesContent: [source], names: [], mappings: 'AAAA;AACA;AACA;AACA;AACA' }
  const script = `${source}//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}`
  writeFileSync(join(directory, 'playwright.config.ts'), `
    export default {
      testDir: '.', testMatch: 'probe.spec.ts', workers: 1, retries: 1,
      metadata: { coverageSuite: 'analytics' },
      outputDir: './test-results/analytics',
      reporter: [['list'], ['html', { outputFolder: './playwright-report/analytics', open: 'never' }],
        [${JSON.stringify(join(root, 'e2e/coverage/reporter.ts'))}, { suite: 'analytics' }]],
    }
  `)
  writeFileSync(join(directory, 'probe.spec.ts'), `
    import { test, expect } from ${JSON.stringify(join(root, 'e2e/coverage/fixture.ts'))}
    test.beforeEach(async ({ page }) => {
      await page.route('http://127.0.0.1:3009/**', route => route.fulfill({
        contentType: route.request().url().endsWith('.js') ? 'text/javascript' : 'text/html',
        body: route.request().url().endsWith('.js') ? (process.env.PROBE_BROKEN_MAP === '1' ? ${JSON.stringify(source + '//# sourceMappingURL=data:application/json;base64,e30=')} : ${JSON.stringify(script)}) : '<script src="/lib/sample.js"></script>',
      }))
      await page.goto('http://127.0.0.1:3009/')
    })
    test('application branch', async ({ page }) => {
      expect(await page.evaluate(() => choose(true))).toBe(1)
      expect(process.env.PROBE_FAIL).not.toBe('1')
    })
    test('retry outcome', async ({ page }, info) => {
      expect(await page.title()).toBe('')
      expect(info.retry).toBe(1)
    })
    test.skip('skipped outcome', async () => {})
  `)
  const run = (failure = false, brokenMap = false) => spawnSync(process.execPath, [cli, 'test', '--config=playwright.config.ts'], {
    cwd: directory, encoding: 'utf8', timeout: 45_000,
    env: { ...process.env, E2E_COVERAGE: '1', PROBE_FAIL: failure ? '1' : '0', PROBE_BROKEN_MAP: brokenMap ? '1' : '0' },
  })
  const status = () => JSON.parse(readFileSync(join(directory, 'coverage/e2e/analytics/status.json'), 'utf8'))
  const first = run()
  assert.equal(first.status, 0, first.stdout + first.stderr)
  assert.deepEqual(status().counts, { passed: 1, failed: 0, skipped: 1, flaky: 1 })
  const coverage = JSON.parse(readFileSync(join(directory, 'coverage/e2e/analytics/coverage-final.json'), 'utf8'))
  assert.deepEqual(Object.keys(coverage), ['lib/sample.js'])
  assert.ok(existsSync(join(directory, 'playwright-report/analytics/index.html')))
  mkdirSync(join(directory, 'coverage/e2e/main'), { recursive: true })
  writeFileSync(join(directory, 'coverage/e2e/main/marker'), 'preserved')
  const failed = run(true)
  assert.equal(failed.status, 1, failed.stdout + failed.stderr)
  assert.deepEqual(status().counts, { passed: 0, failed: 1, skipped: 1, flaky: 1 })
  assert.equal(status().status, 'failed')
  assert.ok(existsSync(join(directory, 'coverage/e2e/analytics/coverage-summary.json')))
  assert.ok(existsSync(join(directory, 'coverage/e2e/main/marker')))
  const broken = run(false, true)
  assert.equal(broken.status, 0, broken.stdout + broken.stderr)
  assert.match(status().coverage, /incomplete/)
  assert.equal(existsSync(join(directory, 'coverage/e2e/analytics/coverage-summary.json')), false)
  assert.ok(existsSync(join(directory, 'playwright-report/analytics/index.html')))
})
