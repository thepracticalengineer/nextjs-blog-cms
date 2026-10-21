import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from 'yaml'
const url = new URL('../../.github/workflows/merge-audit.yml', import.meta.url)
const workflow = existsSync(url) ? parse(readFileSync(url, 'utf8')) : null
async function audit(base, head, parents, title = 'chore: work') {
  const failures = [], notices = []
  if (!workflow) return ['audit not implemented']
  const pr = { merged: true, number: 1, title, merge_commit_sha: 'merged', head: { ref: head, sha: 'head', repo: { full_name: 'org/repo' } }, base: { ref: base } }
  await runInNewContext(`(async () => {${workflow.jobs.audit.steps[0].with.script}\n})()`, {
    context: { repo: { owner: 'org', repo: 'repo' }, payload: { pull_request: pr } },
    github: { rest: { repos: { getCommit: async () => ({ data: { parents: parents.map(sha => ({ sha })) } }) } } },
    core: { setFailed: m => failures.push(m), notice: m => notices.push(m), summary: { addRaw() { return this }, async write() {} } },
  })
  return failures
}
test('promotion, release, hotfix and synchronization merges require the original head as second parent', async () => {
  for (const [base, head, title] of [['main', 'develop'], ['main', 'fix/hotfix'], ['main', 'release-please--branches--main'], ['develop', 'main'], ['develop', 'chore/234-sync-recovery', 'chore(sync): resolve conflicts']]) {
    assert.deepEqual(await audit(base, head, ['base', 'head'], title), [])
    assert.equal((await audit(base, head, ['base'], title)).length, 1)
    assert.equal((await audit(base, head, ['base', 'unrelated'], title)).length, 1)
  }
})
test('ordinary develop merges reject merge commits and audit uses no writes or contributor code', async () => {
  assert.deepEqual(await audit('develop', 'feat/work', ['base']), [])
  assert.equal((await audit('develop', 'feat/work', ['base', 'head'])).length, 1)
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.deepEqual(workflow.on.pull_request_target, { branches: ['main', 'develop'], types: ['closed'] })
  assert.equal(workflow.jobs.audit.steps.length, 1)
  assert.match(workflow.jobs.audit.steps[0].uses, /@[a-f0-9]{40}$/)
  assert.doesNotMatch(workflow.jobs.audit.steps[0].with.script, /exec\(|eval\(|require\(|\$\{\{/)
})
