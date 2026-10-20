import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'

const root = new URL('../../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const workflow = parse(read('.github/workflows/release-please.yml'))

test('only main pushes or explicit main recovery dispatch can release', () => {
  assert.deepEqual(workflow.on, { push: { branches: ['main'] }, workflow_dispatch: null })
  assert.equal(workflow.jobs.release.if, "github.ref == 'refs/heads/main'")
  assert.deepEqual(workflow.concurrency, { group: 'release-please-main', 'cancel-in-progress': false })
})

test('release uses trusted full main history and exposes the minimal App token only to the runner', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  const steps = workflow.jobs.release.steps
  assert.deepEqual(steps[0].with, { ref: 'main', 'fetch-depth': 0, 'persist-credentials': false })
  const install = steps.find(step => step.name === 'Install pinned release library')
  assert.equal(install.run, 'pnpm install --frozen-lockfile --ignore-scripts')
  assert.equal(install.env, undefined)
  const token = steps.find(step => step.id === 'app-token')
  assert.equal(token.uses, 'actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510')
  assert.deepEqual(token.with, {
    'client-id': '${{ vars.RELEASE_APP_CLIENT_ID }}',
    'private-key': '${{ secrets.RELEASE_APP_PRIVATE_KEY }}',
    'permission-contents': 'write', 'permission-issues': 'write', 'permission-pull-requests': 'write',
  })
  const runner = steps.at(-1)
  assert.equal(runner.run, 'node scripts/release/run.mjs')
  assert.equal(runner.env.RELEASE_TOKEN, '${{ steps.app-token.outputs.token }}')
  assert.equal(JSON.parse(read('package.json')).devDependencies['release-please'], '17.6.0')
  assert.ok(steps.indexOf(install) < steps.indexOf(token))
})

test('release PRs receive normal CI including offline release checks', () => {
  const ci = parse(read('.github/workflows/ci.yml'))
  assert.deepEqual(ci.on.pull_request.branches, ['main', 'develop'])
  assert.equal(ci.on.pull_request.paths, undefined)
  assert.equal(ci.jobs.lint.if, undefined)
  assert.ok(ci.jobs.lint.steps.some(step => step.run === 'pnpm run release:test'))
})

test('release Git executable cannot be shadowed by PATH entries', () => {
  const runner = read('scripts/release/run.mjs')
  assert.match(runner, /execFileSync\('\/usr\/bin\/git',/)
})
