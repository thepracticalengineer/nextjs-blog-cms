import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishCoverageComment } from './comment.mjs'

const head = 'a'.repeat(40), merge = 'b'.repeat(40), base = 'c'.repeat(40)
function fixture(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'coverage-comment-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'source'), { recursive: true })
  writeFileSync(join(root, 'source/baseline.json'), JSON.stringify({ sha: merge }))
  const calls = []
  const github = { rest: {
    actions: { getWorkflowRun: async () => ({ data: { id: 123, name: 'CI', path: '.github/workflows/ci.yml', status: 'completed', event: 'pull_request', conclusion: 'failure', head_sha: head, run_attempt: 2, ...overrides } }),
      listJobsForWorkflowRun: async () => ({ data: { jobs: [{ name: 'Unit Tests', conclusion: 'success' }] } }),
      listWorkflowRunArtifacts: async () => ({ data: { artifacts: [{ name: 'coverage-report', id: 456, expired: false }] } }) },
    pulls: { get: async () => ({ data: { state: 'open', head: { sha: head }, base: { ref: 'main', repo: { full_name: 'org/repo' } } } }) },
    repos: { getCommit: async () => ({ data: { parents: [{ sha: base }, { sha: head }] } }) },
    issues: { listComments: async () => ({ data: [] }), createComment: async args => { calls.push(['create', args]); return { data: {} } }, updateComment: async args => { calls.push(['update', args]); return { data: {} } } },
  }, paginate: async (method, args) => { const { data } = await method(args); return Array.isArray(data) ? data : data.jobs ?? data.artifacts } }
  return { root, calls, github, args: { github, owner: 'org', repo: 'repo', runId: 123, prNumber: 7, root } }
}
test('posts coverage on failed CI with missing metrics explicitly unavailable', async t => {
  const f = fixture(t)
  await publishCoverageComment(f.args)
  const body = f.calls[0][1].body
  assert.match(body, /<!-- codex-test-coverage -->/)
  assert.match(body, /attempt 2/)
  assert.match(body, /unavailable/)
  assert.match(body, /artifacts\/456/)
  assert.match(body, new RegExp(merge))
})
test('updates the bot comment instead of duplicating and ignores marker copies by humans', async t => {
  const f = fixture(t)
  f.github.rest.issues.listComments = async () => ({ data: [{ id: 5, user: { login: 'human' }, body: '<!-- codex-test-coverage -->' }, { id: 6, user: { login: 'github-actions[bot]' }, body: '<!-- codex-test-coverage -->\n<!-- coverage-run:123:1 -->' }] })
  await publishCoverageComment(f.args)
  assert.equal(f.calls[0][0], 'update')
  assert.equal(f.calls[0][1].comment_id, 6)
})
test('does not replace a newer run or attempt with an older report', async t => {
  for (const marker of ['124:1', '123:3']) {
    const f = fixture(t)
    f.github.rest.issues.listComments = async () => ({ data: [{ id: 6, user: { login: 'github-actions[bot]' }, body: `<!-- codex-test-coverage -->\n<!-- coverage-run:${marker} -->` }] })
    await publishCoverageComment(f.args)
    assert.equal(f.calls.length, 0)
  }
})
test('rejects cancelled, non-PR, unfinished and unexpected workflows without writes', async t => {
  for (const override of [{ conclusion: 'cancelled' }, { event: 'push' }, { status: 'in_progress' }, { path: '.github/workflows/untrusted.yml' }]) {
    const f = fixture(t, override)
    await publishCoverageComment(f.args)
    assert.equal(f.calls.length, 0)
  }
})
test('rejects stale PR heads and artifacts naming an unrelated tested commit', async t => {
  const f = fixture(t)
  f.github.rest.pulls.get = async () => ({ data: { state: 'open', head: { sha: base }, base: { ref: 'main', repo: { full_name: 'org/repo' } } } })
  await publishCoverageComment(f.args)
  assert.equal(f.calls.length, 0)
  f.github.rest.pulls.get = async () => ({ data: { state: 'open', head: { sha: head }, base: { ref: 'main', repo: { full_name: 'org/repo' } } } })
  f.github.rest.repos.getCommit = async () => ({ data: { parents: [{ sha: base }] } })
  await publishCoverageComment(f.args)
  assert.match(f.calls[0][1].body, /Tested commit: `unavailable`/)
})

test('checks the head again before posting and allows a fork head with matching identity', async t => {
  const f = fixture(t)
  let reads = 0
  f.github.rest.pulls.get = async () => ({ data: { state: 'open', head: { sha: ++reads === 1 ? head : base, repo: { full_name: 'fork/repo' } }, base: { ref: 'main', repo: { full_name: 'org/repo' } } } })
  await publishCoverageComment(f.args)
  assert.equal(f.calls.length, 0)
  f.github.rest.pulls.get = async () => ({ data: { state: 'open', head: { sha: head, repo: { full_name: 'fork/repo' } }, base: { ref: 'main', repo: { full_name: 'org/repo' } } } })
  await publishCoverageComment(f.args)
  assert.equal(f.calls.length, 1)
})

for (const branch of ['develop', 'main', 'feat/untrusted']) {
  test(`coverage target ${branch} is checked independently of workflow filters`, async t => {
    const f = fixture(t)
    f.github.rest.pulls.get = async () => ({ data: { state: 'open', head: { sha: head }, base: { ref: branch, repo: { full_name: 'org/repo' } } } })
    await publishCoverageComment(f.args)
    assert.equal(f.calls.length, branch === 'feat/untrusted' ? 0 : 1)
  })
}

test('verified lightweight snapshots publish intentional omission rather than missing coverage', async t => {
  const f = fixture(t)
  writeFileSync(join(f.root, 'source/baseline.json'), JSON.stringify({ sha: merge, validationMode: 'metadata' }))
  await publishCoverageComment(f.args)
  assert.match(f.calls[0][1].body, /intentionally omitted/)
  assert.doesNotMatch(f.calls[0][1].body, /suite did not produce a report/)
})
