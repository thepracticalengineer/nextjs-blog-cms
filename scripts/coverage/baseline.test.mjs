import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, delimiter } from 'node:path'
import { spawnSync } from 'node:child_process'

const script = resolve(import.meta.dirname, 'baseline.mjs')
const sha = 'a'.repeat(40)
function run(t, candidates, failDownload = false) {
  const directory = mkdtempSync(join(tmpdir(), 'baseline-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  writeFileSync(join(directory, 'gh'), `#!/usr/bin/env node
    const fs = require('fs');
    fs.appendFileSync('calls.jsonl', JSON.stringify(process.argv.slice(2))+'\\n');
    if (process.argv[2] === 'api') console.log(process.env.RUNS);
    else {
      fs.mkdirSync('baseline', {recursive:true});
      fs.writeFileSync('baseline/baseline.json', '{"sha":"${sha}"}');
      if (process.env.FAIL_DOWNLOAD === '1') process.exit(1);
    }
  `, { mode: 0o755 })
  const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8', env: {
    ...process.env, PATH: `${directory}${delimiter}${process.env.PATH}`, BASELINE_SHA: sha,
    GITHUB_REPOSITORY: 'example/repo', RUNS: candidates, FAIL_DOWNLOAD: failDownload ? '1' : '0',
  } })
  assert.equal(result.status, 0, result.stderr)
  return { directory, stdout: result.stdout, calls: readFileSync(join(directory, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) }
}
const good = { id: 123, head_sha: sha, head_branch: 'main', event: 'push', conclusion: 'success' }
test('only downloads a successful main push artifact for the exact base SHA', t => {
  const result = run(t, JSON.stringify({ workflow_runs: [{ ...good, id: 9, head_sha: 'b'.repeat(40) }, { ...good, id: 10, event: 'pull_request' }, good] }))
  assert.deepEqual(result.calls[1], ['run', 'download', '123', '--repo', 'example/repo', '--name', 'coverage-baseline', '--dir', 'baseline'])
  assert.match(result.stdout, /Downloaded baseline/)
})
test('API errors produce an unavailable baseline without failing reporting', t => {
  const result = run(t, 'not JSON')
  assert.equal(result.calls.length, 1)
  assert.match(result.stdout, /Baseline unavailable/)
})
test('expired or failed downloads discard partial files', t => {
  const result = run(t, JSON.stringify({ workflow_runs: [good] }), true)
  assert.equal(existsSync(join(result.directory, 'baseline/baseline.json')), false)
  assert.match(result.stdout, /missing, expired, or inaccessible/)
})
