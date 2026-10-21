import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { validate } from './fixtures/policy.test.mjs'
import { parse } from 'yaml'
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const workflow = parse(read('.github/workflows/pr-policy.yml'))
const script = workflow.jobs.policy.steps[0].with.script
test('ordinary feature and fork PRs target develop; main only admits reviewed sources', async () => {
  assert.deepEqual(await validate('develop', 'feat/215-work', { fork: true }), [])
  assert.equal((await validate('main', 'feat/215-work')).length, 1)
  assert.equal((await validate('main', 'fix/215-work', { fork: true })).length, 1)
  assert.equal((await validate('main', 'fix/215-work')).length, 1)
  assert.deepEqual(await validate('main', 'fix/215-work', { labels: ['production-hotfix'] }), [])
})
test('promotion and synchronization require same-repository branches and hidden chore titles', async () => {
  assert.deepEqual(await validate('main', 'develop', { title: 'chore(promotion): promote develop to main' }), [])
  assert.equal((await validate('main', 'develop', { title: 'feat: promote' })).length, 1)
  assert.deepEqual(await validate('develop', 'main', { title: 'chore(sync): merge main into develop' }), [])
  assert.equal((await validate('develop', 'main', { fork: true, title: 'chore(sync): merge main into develop' })).length, 1)
})
test('release source needs the installed App, expected branch, pending label and metadata-only files', async () => {
  const options = { author: 'the-practical-engineer-releases[bot]', title: 'chore(main): release 1.2.0', labels: ['autorelease: pending'] }
  const head = 'release-please--branches--main--components--nextjs-blog-cms'
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

test('production-hotfix designation requires a same-repository fix branch and fix title', async () => {
  const labels = ['production-hotfix']
  for (const [head, options] of [
    ['fix/215-repair', { fork: true }], ['feat/215-work', {}],
    ['fix/215-repair', { title: 'chore: ordinary maintenance' }],
  ]) assert.equal((await validate('main', head, { labels, ...options })).length, 1)
  assert.deepEqual(await validate('main', 'fix/215-repair', { labels, title: 'fix(auth)!: repair production authentication' }), [])
  assert.equal((await validate('main', 'fix/215-repair', { labels: [] })).length, 1)
})

for (const file of ['release-please.yml', 'sync-develop.yml']) {
  test(`${file} pins every action sharing a job with App credentials`, () => {
    const privileged = parse(read(`.github/workflows/${file}`))
    for (const job of Object.values(privileged.jobs)) {
      for (const step of job.steps.filter(step => step.uses)) assert.match(step.uses, /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/)
    }
  })
}

test('accept actual root release branch while rejecting other components', async () => {
  const options = { author: 'the-practical-engineer-releases[bot]', title: 'chore(main): release 3.0.0', labels: ['autorelease: pending'] }
  const head = 'release-please--branches--main--components--nextjs-blog-cms'
  assert.deepEqual(await validate('main', head, options), [])
  for (const override of [{ author: 'human' }, { files: ['app/page.tsx'] }, { labels: [] }, { fork: true }]) {
    assert.equal((await validate('main', head, { ...options, ...override })).length, 1)
  }
  assert.equal((await validate('main', 'release-please--branches--main--components--other', options)).length, 1)
})

test('release trust rejects legacy branches, identity mismatches and every non-modified status', async () => {
  const head = 'release-please--branches--main--components--nextjs-blog-cms'
  const options = { author: 'the-practical-engineer-releases[bot]', title: 'chore(main): release 3.1.0', labels: ['autorelease: pending'] }
  assert.equal((await validate('main', 'release-please--branches--main', options)).length, 1)
  for (const override of [
    { authorId: 1 }, { authorType: 'User' }, { title: 'chore(main): release 3.1.0 extra' },
    { files: [] }, ...['added', 'removed', 'renamed', 'copied', 'changed', 'unknown'].map(status => ({ files: [{ filename: 'package.json', status }] })),
  ]) assert.equal((await validate('main', head, { ...options, ...override })).length, 1)
  assert.deepEqual(await validate('develop', 'fix/231-release-policy-contract'), [])
})

test('promotion and sync reject breaking metadata before it can contaminate releases', async () => {
  for (const [base, head, title] of [
    ['main', 'develop', 'chore(promotion): promote develop to main'],
    ['develop', 'main', 'chore(sync): merge main into develop'],
  ]) {
    for (const body of ['BREAKING CHANGE: retired API', '  BREAKING-CHANGE: retired API', 'feat!:copied retirement']) {
      assert.equal((await validate(base, head, { title, body })).length, 1)
    }
  }
})
