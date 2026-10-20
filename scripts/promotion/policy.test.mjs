import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { parse } from 'yaml'
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const workflow = parse(read('.github/workflows/pr-policy.yml'))
const script = workflow.jobs.policy.steps[0].with.script
async function validate(base, head, { fork = false, author = 'human', title = 'fix: repair behavior', files = ['package.json'], labels = [] } = {}) {
  const failures = []
  await runInNewContext(`(async () => {${script}\n})()`, {
    context: { repo: { owner: 'org', repo: 'repo' }, issue: { number: 1 } },
    github: { rest: { pulls: {
      get: async () => ({ data: { base: { ref: base }, head: { ref: head, repo: { full_name: fork ? 'fork/repo' : 'org/repo' } }, title, user: { login: author }, labels: labels.map(name => ({ name })) } }),
      listFiles: async () => ({ data: files.map(filename => ({ filename, status: 'modified' })) }),
    } }, paginate: async method => (await method()).data },
    core: { setFailed: message => failures.push(message), notice() {} },
  })
  return failures
}
test('ordinary feature and fork PRs target develop; main only admits reviewed sources', async () => {
  assert.deepEqual(await validate('develop', 'feat/215-work', { fork: true }), [])
  assert.equal((await validate('main', 'feat/215-work')).length, 1)
  assert.equal((await validate('main', 'fix/215-work', { fork: true })).length, 1)
  assert.deepEqual(await validate('main', 'fix/215-work'), [])
})
test('promotion and synchronization require same-repository branches and hidden chore titles', async () => {
  assert.deepEqual(await validate('main', 'develop', { title: 'chore(promotion): promote develop to main' }), [])
  assert.equal((await validate('main', 'develop', { title: 'feat: promote' })).length, 1)
  assert.deepEqual(await validate('develop', 'main', { title: 'chore(sync): merge main into develop' }), [])
  assert.equal((await validate('develop', 'main', { fork: true, title: 'chore(sync): merge main into develop' })).length, 1)
})
test('release source needs the installed App, expected branch, pending label and metadata-only files', async () => {
  const options = { author: 'the-practical-engineer-releases[bot]', title: 'chore(main): release 1.2.0', labels: ['autorelease: pending'] }
  const head = 'release-please--branches--main'
  assert.deepEqual(await validate('main', head, options), [])
  for (const override of [{ author: 'human' }, { files: ['app/page.tsx'] }, { labels: [] }, { fork: true }]) {
    assert.equal((await validate('main', head, { ...options, ...override })).length, 1)
  }
})
test('policy runs from trusted base metadata with no checkout or write permission', () => {
  assert.deepEqual(workflow.permissions, { 'pull-requests': 'read' })
  assert.deepEqual(workflow.on.pull_request_target.branches, ['main', 'develop'])
  assert.ok(workflow.on.pull_request_target.types.includes('edited'))
  assert.ok(workflow.on.pull_request_target.types.includes('labeled'))
  assert.equal(workflow.jobs.policy.steps.length, 1)
  assert.doesNotMatch(script, /\$\{\{|require\(|exec\(|eval\(/)
})
test('sync workflow runs immutable main code with a minimal App token and serialized writes', () => {
  const sync = parse(read('.github/workflows/sync-develop.yml'))
  assert.deepEqual(sync.on, { push: { branches: ['main'] }, workflow_dispatch: null })
  assert.equal(sync.jobs.synchronize.if, "github.ref == 'refs/heads/main'")
  assert.equal(sync.concurrency['cancel-in-progress'], false)
  const steps = sync.jobs.synchronize.steps
  assert.equal(steps[0].with.ref, '${{ github.sha }}')
  assert.equal(steps[0].with['persist-credentials'], false)
  assert.equal(steps[1].with['permission-contents'], 'read')
  assert.equal(steps[1].with['permission-pull-requests'], 'write')
  assert.equal(steps[1].with['permission-workflows'], undefined)
  assert.equal(steps[2].with['github-token'], '${{ steps.app-token.outputs.token }}')
})
