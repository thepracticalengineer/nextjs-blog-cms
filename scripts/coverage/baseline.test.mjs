import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadBaseline } from './baseline.mjs'

const sha = 'a'.repeat(40)
function run(t, candidates, failDownload = false) {
  const directory = mkdtempSync(join(tmpdir(), 'baseline-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const calls = []
  const message = downloadBaseline({ sha, repo: 'example/repo', directory, run: (command, args) => {
    assert.equal(command, '/usr/bin/gh')
    calls.push(args)
    if (args[0] === 'api') return { stdout: candidates, status: 0 }
    writeFileSync(join(directory, 'baseline.json'), JSON.stringify({ sha }))
    return { status: failDownload ? 1 : 0 }
  } })
  return { directory, message, calls }
}
const good = { id: 123, head_sha: sha, head_branch: 'main', event: 'push', conclusion: 'success' }
test('only downloads a successful main push artifact for the exact base SHA using the system executable', t => {
  const result = run(t, JSON.stringify({ workflow_runs: [{ ...good, id: 9, head_sha: 'b'.repeat(40) }, { ...good, id: 10, event: 'pull_request' }, good] }))
  assert.deepEqual(result.calls[1], ['run', 'download', '123', '--repo', 'example/repo', '--name', 'coverage-baseline', '--dir', result.directory])
  assert.match(result.message, /Downloaded baseline/)
})
test('API errors produce an unavailable baseline without failing reporting', t => {
  const result = run(t, 'not JSON')
  assert.equal(result.calls.length, 1)
  assert.match(result.message, /Baseline unavailable/)
})
test('expired or failed downloads discard partial files', t => {
  const result = run(t, JSON.stringify({ workflow_runs: [good] }), true)
  assert.equal(existsSync(join(result.directory, 'baseline.json')), false)
  assert.match(result.message, /missing, expired, or inaccessible/)
})

for (const branch of ['develop', 'main']) {
  test(`accepts exact successful ${branch} push baseline`, t => {
    const result = run(t, JSON.stringify({ workflow_runs: [{ ...good, head_branch: branch }] }))
    assert.match(result.message, /Downloaded baseline/)
  })
}
test('rejects feature branch baseline even at the same SHA', t => {
  const result = run(t, JSON.stringify({ workflow_runs: [{ ...good, head_branch: 'feat/untrusted' }] }))
  assert.equal(result.calls.length, 1)
  assert.match(result.message, /Baseline unavailable/)
})
