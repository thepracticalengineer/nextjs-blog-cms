import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderedHistory } from './history.mjs'
const sha = value => value.repeat(40)
const boundary = sha('b'), promotion = sha('c'), olderFeature = sha('a')
test('exact Git range retains an older newly promoted commit beyond chronological release boundary', async () => {
  const chronological = [{ sha: promotion }, { sha: boundary }, { sha: olderFeature }]
  const iterate = async function* () { yield* chronological }
  const history = await orderedHistory({ iterate, shas: [promotion, olderFeature, boundary], options: {} })
  assert.deepEqual(history.map(c => c.sha), [promotion, olderFeature, boundary])
})
test('missing history fails closed rather than publishing incomplete notes', async () => {
  const iterate = async function* () { yield { sha: boundary } }
  await assert.rejects(orderedHistory({ iterate, shas: [olderFeature, boundary], options: {} }), /missing/)
})
test('replayed ancestors and repeated API nodes never enter the release range twice', async () => {
  const iterate = async function* () { yield { sha: sha('d') }; yield { sha: promotion }; yield { sha: promotion }; yield { sha: boundary } }
  const history = await orderedHistory({ iterate, shas: [promotion, boundary], options: {} })
  assert.deepEqual(history.map(c => c.sha), [promotion, boundary])
})

test('real Git ancestry includes pre-release develop work after release synchronization and promotion', async t => {
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { installAncestryHistory } = await import('./run.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'release-ancestry-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  let day = 1
  const git = args => execFileSync('git', ['-c', 'user.name=Offline', '-c', 'user.email=offline@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_DATE: `2020-01-${String(day).padStart(2, '0')}T12:00:00Z`, GIT_COMMITTER_DATE: `2020-01-${String(day).padStart(2, '0')}T12:00:00Z` },
  }).trim()
  const commit = (file, message) => { writeFileSync(join(dir, file), file); git(['add', file]); git(['commit', '-m', message]); day++ }
  git(['init', '-b', 'main'])
  commit('base', 'chore: baseline')
  git(['checkout', '-b', 'develop'])
  commit('feature', 'feat: older reader feature')
  const feature = git(['rev-parse', 'HEAD'])
  git(['checkout', 'main'])
  commit('hotfix', 'fix: released hotfix')
  commit('version', 'chore(main): release 1.1.0')
  const released = git(['rev-parse', 'HEAD'])
  git(['checkout', 'develop'])
  git(['merge', '--no-ff', 'main', '-m', 'chore(sync): merge main into develop']); day++
  git(['checkout', 'main'])
  git(['merge', '--no-ff', 'develop', '-m', 'chore(promotion): promote develop to main'])
  const chronological = git(['log', '--format=%H']).split('\n')
  assert.ok(chronological.indexOf(feature) > chronological.indexOf(released))
  const github = {
    async *releaseIterator() { yield { tagName: 'v1.1.0', sha: released } },
    async *mergeCommitIterator() { for (const sha of chronological) yield { sha } },
  }
  await installAncestryHistory(github, { runGit: git })
  const ordered = []
  for await (const commit of github.mergeCommitIterator('main')) ordered.push(commit.sha)
  assert.equal(ordered.at(-1), released)
  assert.equal(ordered.filter(sha => sha === feature).length, 1)
  assert.deepEqual(new Set(ordered), new Set([...git(['rev-list', `${released}..HEAD`]).split('\n'), released]))
})

for (const title of ['chore(promotion): promote develop to main', 'chore(sync): merge main into develop', 'Merge pull request #225 from org/develop\n\nchore(promotion): promote develop to main']) {
  test(`copied breaking footer fails closed on ${title.split('\n')[0]}`, async () => {
    const iterate = async function* () {
      yield { sha: promotion, message: `${title}\n\nBREAKING-CHANGE: already released API retirement` }
      yield { sha: boundary }
    }
    await assert.rejects(orderedHistory({ iterate, shas: [promotion, boundary], options: {} }), /Breaking release metadata/)
  })
}

test('real breaking feature declarations survive; already published contaminated boundaries are excluded', async () => {
  const feature = { sha: olderFeature, message: 'feat!: new breaking change\n\nBREAKING CHANGE: new API migration' }
  const released = { sha: boundary, message: 'chore(promotion): old promotion\n\nBREAKING CHANGE: already published' }
  const iterate = async function* () { yield feature; yield released }
  assert.deepEqual(await orderedHistory({ iterate, shas: [olderFeature, boundary], options: {} }), [feature, released])
})
