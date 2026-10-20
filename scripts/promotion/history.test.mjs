import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { synchronize } from './sync.mjs'

test('disposable Git rehearsal preserves feature, release, concurrent develop work and hotfix ancestry', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'promotion-history-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const args = ['-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null']
  const git = (...cmd) => execFileSync('git', [...args, ...cmd], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const commit = (file, value, message) => { writeFileSync(join(dir, file), value); git('add', file); git('commit', '-m', message) }
  git('init', '-b', 'main')
  commit('version', '1.0.0', 'chore: initialize fixture')
  git('checkout', '-b', 'develop')
  commit('feature', 'reader feature', 'feat: add reader feature')
  const feature = git('rev-parse', 'HEAD')
  git('checkout', 'main')
  git('merge', '--no-ff', 'develop', '-m', 'chore(promotion): promote develop to main')
  const writes = []
  const pr = { number: 1, html_url: 'https://example.invalid/pr/1', mergeable: true, head: { ref: 'main', repo: { full_name: 'offline/repo' } } }
  let pending = false
  const github = { rest: {
    repos: { compareCommitsWithBasehead: async () => ({ data: {
      ahead_by: Number(git('rev-list', '--count', 'develop..main')),
      files: git('diff', '--name-only', 'develop...main').split('\n').filter(Boolean).map(filename => ({ filename })),
    } }) },
    pulls: {
      list: async () => ({ data: pending ? [pr] : [] }),
      create: async value => { writes.push(value); pending = true; return { data: pr } },
      get: async () => { const merge = spawnSync('git', [...args, 'merge-tree', '--write-tree', 'develop', 'main'], { cwd: dir }); return { data: { ...pr, mergeable: merge.status === 0 } } },
    },
  }, paginate: async (fn, params) => (await fn(params)).data }
  const failures = []
  const core = { notice() {}, setFailed: m => failures.push(m), summary: { addRaw() { return this }, async write() {} } }
  const sync = () => synchronize({ github, core, owner: 'offline', repo: 'repo' })
  assert.equal((await sync()).status, 'synchronized') // promotion ancestry only
  assert.equal(writes.length, 0)
  commit('version', '1.1.0', 'chore(main): release 1.1.0')
  git('tag', 'v1.1.0') // disposable repository only
  git('checkout', 'develop')
  commit('concurrent', 'keep this work', 'feat: add concurrent work')
  const concurrent = git('rev-parse', 'HEAD')
  assert.equal((await sync()).status, 'open')
  await sync()
  assert.equal(writes.length, 1)
  assert.equal(git('rev-parse', 'develop'), concurrent) // automation never updates refs
  git('merge', '--no-ff', 'main', '-m', 'chore(sync): merge main into develop')
  pending = false
  assert.equal((await sync()).status, 'synchronized')
  assert.equal(git('show', 'develop:concurrent'), 'keep this work')
  git('checkout', 'main')
  commit('hotfix', 'production repair', 'fix: repair production')
  assert.equal((await sync()).status, 'open')
  git('checkout', 'develop')
  git('merge', '--no-ff', 'main', '-m', 'chore(sync): merge main into develop')
  assert.equal(git('merge-base', '--is-ancestor', feature, 'develop'), '')
  assert.equal(git('show', 'develop:hotfix'), 'production repair')
  assert.equal((await sync()).status, 'synchronized')
  git('checkout', 'main')
  git('merge', '--no-ff', 'develop', '-m', 'chore(promotion): promote develop to main')
  assert.equal((await sync()).status, 'synchronized') // no empty sync loop
  assert.deepEqual(failures, [])
  // Deliberate divergent edit must surface a conflict, preserving both branches.
  git('checkout', 'develop')
  commit('hotfix', 'develop revision', 'fix: revise reader behavior')
  git('checkout', 'main')
  commit('hotfix', 'different production revision', 'fix: revise production behavior')
  const refs = [git('rev-parse', 'main'), git('rev-parse', 'develop')]
  assert.equal((await sync()).status, 'attention')
  assert.equal(failures.length, 1)
  assert.deepEqual([git('rev-parse', 'main'), git('rev-parse', 'develop')], refs)
})
