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

test('privileged workflow uses a short-lived scoped App token without checking out code', () => {
  assert.deepEqual(workflow.permissions, {})
  const steps = workflow.jobs.release.steps
  const token = steps.find(step => step.id === 'app-token')
  assert.equal(token.uses, 'actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510')
  assert.deepEqual(token.with, {
    'client-id': '${{ vars.RELEASE_APP_CLIENT_ID }}',
    'private-key': '${{ secrets.RELEASE_APP_PRIVATE_KEY }}',
    'permission-contents': 'write',
    'permission-issues': 'write',
    'permission-pull-requests': 'write',
  })
  const action = steps.find(step => step.uses?.startsWith('googleapis/release-please-action@'))
  assert.equal(action.uses, 'googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7')
  assert.deepEqual(action.with, {
    token: '${{ steps.app-token.outputs.token }}',
    'target-branch': 'main',
    'config-file': 'release-please-config.json',
    'manifest-file': '.release-please-manifest.json',
  })
  assert.equal(JSON.parse(read('package.json')).devDependencies['release-please'], '17.6.0')
  assert.equal(steps.filter(step => step.uses).length, 2)
  assert.equal(steps.filter(step => step.run).length, 1)
  assert.match(steps[0].run, /exit 1/)
  assert.match(steps[0].run, /docs\/operations\/releases\.md#initial-setup/)
})

test('release PRs receive normal CI including offline release checks', () => {
  const ci = parse(read('.github/workflows/ci.yml'))
  assert.deepEqual(ci.on.pull_request.branches, ['main'])
  assert.equal(ci.on.pull_request.paths, undefined)
  assert.equal(ci.jobs.lint.if, undefined)
  assert.ok(ci.jobs.lint.steps.some(step => step.run === 'pnpm run release:test'))
})
