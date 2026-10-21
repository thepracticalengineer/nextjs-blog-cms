import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { parse } from 'yaml'

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const workflow = parse(read('.github/workflows/pr-title.yml'))
const script = workflow.jobs.title.steps[0].with.script

for (const title of [
  'feat(comments): add single-level replies', 'fix(auth): preserve return navigation',
  'ci(release): configure release automation', 'feat!: remove legacy API',
  'refactor(api)!: remove old response', 'chore(main): release 1.2.3',
  'chore(deps): bump next from 16.0.0 to 16.1.0',
  ...['docs', 'perf', 'test', 'build', 'revert'].map(type => `${type}: update behavior`),
]) {
  test(`accepts ${title}`, async () => {
    assert.deepEqual(await validate(title), [])
  })
}
for (const title of [
  '', 'Update dependencies', 'Feat: add replies', 'feature: add replies',
  'fix:no space', 'fix: ', 'fix(): repair API', 'fix(api)!!: break API',
  'fix: repair API\nBREAKING CHANGE: remove API', 'fix: repair API\rhidden', 'fix: repair API\n',
]) {
  test(`rejects ${JSON.stringify(title)} with correction guidance`, async () => {
    const failures = await validate(title)
    assert.equal(failures.length, 1)
    assert.match(failures[0], /feat\(comments\):/)
    assert.match(failures[0], /contributing/)
  })
}

async function validate(title) {
  const failures = []
  await runInNewContext(`(async () => {${script}\n})()`, {
    context: { repo: { owner: 'owner', repo: 'repo' }, issue: { number: 192 },
      payload: { pull_request: { title: 'stale invalid title' } } },
    github: { rest: { pulls: { get: async () => ({ data: { title } }) } } },
    core: { setFailed: message => failures.push(message) },
  })
  return failures
}

test('title edits revalidate on a read-only workflow without contributor execution', () => {
  assert.deepEqual(workflow.on, { pull_request_target: {
    branches: ['main', 'develop'], types: ['opened', 'edited', 'reopened', 'synchronize', 'ready_for_review'],
  } })
  assert.deepEqual(workflow.permissions, { 'pull-requests': 'read' })
  assert.equal(workflow.jobs.title.name, 'PR title')
  assert.equal(workflow.jobs.title.steps.length, 1)
  assert.match(workflow.jobs.title.steps[0].uses, /^actions\/github-script@[a-f0-9]{40}$/)
  assert.doesNotMatch(script, /\$\{\{|require\(|exec\(|eval\(/)
})

test('long-lived branches retain push CI and dependency bots use compatible titles', () => {
  const ci = parse(read('.github/workflows/ci.yml'))
  for (const branch of ['develop', 'main']) {
    assert.ok(ci.on.push.branches.includes(branch))
  }
  assert.deepEqual(ci.on.pull_request.branches, ['main', 'develop'])
  for (const update of parse(read('.github/dependabot.yml')).updates) {
    assert.deepEqual(update['commit-message'], { prefix: 'chore', 'include': 'scope' })
  }
})
