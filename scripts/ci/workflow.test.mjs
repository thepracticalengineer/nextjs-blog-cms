import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const ci = parse(read('.github/workflows/ci.yml'))
test('CI removes feature pushes, supports manual checks, and scopes PR cancellation by event and number', () => {
  assert.deepEqual(ci.on.push.branches, ['main', 'develop'])
  assert.ok(Object.hasOwn(ci.on, 'workflow_dispatch'))
  assert.equal(ci.on.pull_request.paths, undefined)
  assert.match(ci.concurrency.group, /github.event_name/)
  assert.match(ci.concurrency.group, /github.event.pull_request.number/)
  assert.match(ci.concurrency.group, /github.run_id/)
  assert.equal(ci.concurrency['cancel-in-progress'], "${{ github.event_name == 'pull_request' }}")
})
test('gate always evaluates every required dependency; lightweight paths retain lint and reporting', () => {
  assert.equal(ci.jobs.gate?.if, '${{ always() }}')
  assert.deepEqual(ci.jobs.gate.needs, ['classify', 'lint', 'test', 'build', 'database', 'e2e', 'browsers', 'coverage'])
  assert.equal(ci.jobs.coverage.if, '${{ !cancelled() }}')
  assert.equal(ci.jobs.lint.if, undefined)
  for (const name of ['test', 'build', 'database', 'e2e', 'browsers']) assert.equal(ci.jobs[name].if, "needs.classify.outputs.mode == 'full'")
})
test('database assertions, full-stack publication and isolated groups remain independently executable', () => {
  assert.ok(ci.jobs.database, 'separate database job')
  const db = ci.jobs.database.steps.map(step => step.run ?? '').join('\n')
  for (const file of ['auth_abuse.sql', 'auth_abuse_review.sql', 'legacy_ai_retirement.sql', 'bulk_post_retention.sql', 'mfa_assurance.sql', 'public_author_profiles.sql', 'post_working_copies.sql', 'post_slug_routes.sql', 'post_lists.sql', 'atomic_posts.sql', 'pages.sql', 'pages-concurrency.mjs', 'tag_taxonomy.sql', 'post_media.sql', 'post_media_dedup.sql', 'media_library.sql', 'media-library-concurrency.mjs', 'media-library-upgrade.mjs', 'comment_writes.sql', 'comment-writes-concurrency.mjs', 'comment_reactions.sql', 'article_reactions.sql', 'newsletter_queue.sql', 'auth-abuse-concurrency.mjs', 'legacy-ai-upgrade.mjs', 'post-media-concurrency.mjs', 'comment-reactions-concurrency.mjs', 'article-reactions-concurrency.mjs']) assert.ok(db.includes(file), file)
  const full = ci.jobs.e2e.steps.map(step => step.run ?? '').join('\n')
  assert.match(full, /pnpm run test:e2e/)
  assert.match(full, /pnpm run build/)
  assert.match(full, /E2E_PRODUCTION=1.*publication-pages.spec.ts/)
  assert.equal(ci.jobs.browsers.strategy['fail-fast'], false)
  assert.deepEqual(ci.jobs.browsers.strategy.matrix.group, ['harness', 'auth', 'content'])
  const browser = read('scripts/ci/browser.mjs')
  for (const config of ['analytics', 'ai-settings', 'bulk-posts', 'posts-navigation', 'oauth-ui', 'auth-abuse', 'mfa', 'image-dialog', 'media-library', 'link-dialog', 'video-dialog', 'comment-reactions', 'article-reactions', 'homepage', 'seo']) assert.ok(browser.includes(`'${config}'`), config)
})
test('split reports are merged and republished under the existing aggregate name', () => {
  const steps = ci.jobs.coverage.steps
  assert.ok(steps.some(step => step.uses?.startsWith('actions/download-artifact@') && step.with?.pattern === 'e2e-reports-*' && step.with['merge-multiple'] === true))
  assert.ok(steps.some(step => step.uses?.startsWith('actions/upload-artifact@') && step.with?.name === 'e2e-reports'))
  assert.ok(steps.some(step => step.env?.VALIDATION_MODE === '${{ needs.classify.outputs.mode }}'))
})
test('full-stack runner generates its own disposable provider key before API tests', () => {
  const steps = ci.jobs.e2e.steps
  const key = steps.findIndex(step => step.name === 'Generate disposable provider encryption key')
  const tests = steps.findIndex(step => step.run === 'pnpm run test:e2e')
  assert.ok(key >= 0 && key < tests)
})
test('privileged coverage publication loads immutable default-branch modules and never checks out PR code', () => {
  const publisher = parse(read('.github/workflows/coverage-comment.yml'))
  const steps = publisher.jobs.comment.steps
  assert.equal(steps.some(step => step.uses?.startsWith('actions/checkout@')), false)
  const loader = steps.find(step => step.env?.PUBLISHER_CODE_ROOT)?.with.script
  assert.match(loader, /context.payload.repository.default_branch/)
  assert.match(loader, /ref: sha/)
  assert.doesNotMatch(loader, /pull_request\.head|pnpm install/)
  assert.equal(publisher.concurrency['cancel-in-progress'], false)
  for (const file of ['release-please.yml', 'sync-develop.yml', 'promote-develop.yml']) {
    const workflow = parse(read(`.github/workflows/${file}`))
    assert.equal(workflow.concurrency['cancel-in-progress'], false)
    assert.notEqual(workflow.concurrency.group, ci.concurrency.group)
  }
})
test('full coverage fails when any split artifact is missing, including groups without measured coverage', () => {
  const inventory = ci.jobs.coverage.steps.find(step => step.name === 'Verify split artifact inventory')
  assert.ok(inventory)
  assert.match(inventory.if, /always\(\)/)
  for (const name of ['e2e-reports-fullstack', 'e2e-reports-isolated-harness', 'e2e-reports-isolated-auth', 'e2e-reports-isolated-content']) assert.ok(inventory.with.script.includes(name))
  assert.match(inventory.with.script, /throw new Error/)
})
test('artifact inventory accepts a complete split and rejects a missing noncoverage group', async () => {
  const { runInNewContext } = await import('node:vm')
  const script = ci.jobs.coverage.steps.find(step => step.name === 'Verify split artifact inventory').with.script
  const names = ['e2e-reports-fullstack', 'e2e-reports-isolated-harness', 'e2e-reports-isolated-auth', 'e2e-reports-isolated-content']
  const run = artifacts => runInNewContext(`(async () => {${script}\n})()`, {
    context: { repo: { owner: 'org', repo: 'repo' }, runId: 1 },
    github: { rest: { actions: { listWorkflowRunArtifacts() {} } }, paginate: async () => artifacts.map(name => ({ name, expired: false })) },
  })
  await run(names)
  await assert.rejects(run(names.slice(0, -1)), /Missing split report artifacts: e2e-reports-isolated-content/)
})
test('retargeted PRs rerun classification so main hotfixes cannot reuse develop lightweight checks', () => {
  assert.ok(ci.on.pull_request.types?.includes('edited'))
  assert.ok(ci.on.pull_request.types.includes('ready_for_review'))
  for (const type of ['opened', 'synchronize', 'reopened']) assert.ok(ci.on.pull_request.types.includes(type))
})
