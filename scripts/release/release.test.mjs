import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { validate } from '../promotion/fixtures/policy.test.mjs'
import { installAncestryHistory, runRelease } from './run.mjs'

const require = createRequire(import.meta.url)
const { GitHub } = require('release-please/build/src/github.js')
const { Manifest } = require('release-please/build/src/manifest.js')
const { FileNotFoundError, DuplicateReleaseError } = require('release-please/build/src/errors/index.js')
const { setLogger } = require('release-please/build/src/util/logger.js')
setLogger(Object.fromEntries(['info', 'warn', 'error', 'debug', 'trace'].map(key => [key, () => {}])))

const root = new URL('../../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const boundary = '9fd450506d6a0d54ed022748d53ca31db2b79e16'
const commit = (message, sha = 'a'.repeat(40)) => ({ sha, message, files: ['app/page.tsx'] })

// Only the GitHub boundary is fake: planning, parsing, updaters, PR selection and
// release selection all run in the pinned upstream library. No real client/token.
function fixture(messages = ['fix: repair navigation']) {
  const files = new Map(['release-please-config.json', '.release-please-manifest.json', 'package.json', 'CHANGELOG.md']
    .map(path => [path, read(path)]))
  // A stable synthetic baseline keeps these cases valid after real version bumps.
  files.set('package.json', JSON.stringify({ ...JSON.parse(files.get('package.json')), version: '1.0.0' }))
  files.set('.release-please-manifest.json', JSON.stringify({ '.': '1.0.0' }))
  const state = {
    commits: [...messages.map((message, i) => commit(message, String(i + 1).repeat(40))),
      commit('feat!: historical breaking change', boundary),
      commit('feat!: older breaking change', 'b'.repeat(40))],
    pulls: [], releases: [], creates: 0, updates: 0, publishAttempts: 0,
  }
  const contents = path => {
    if (!files.has(path)) throw new FileNotFoundError(path)
    const parsedContent = files.get(path)
    return { parsedContent, content: Buffer.from(parsedContent).toString('base64'), sha: 'f'.repeat(40) }
  }
  const github = new Proxy({
    repository: { owner: 'example', repo: 'offline-release-test', defaultBranch: 'main' },
    async getFileJson(path) { return JSON.parse(contents(path).parsedContent) },
    async getFileContentsOnBranch(path) { return contents(path) },
    async *releaseIterator() { yield* state.releases },
    async *tagIterator() { yield* state.releases.map(r => ({ name: r.tagName, sha: r.sha })) },
    async *mergeCommitIterator(branch, options) {
      // Exercise the actual upstream GraphQL history parser and iterator, including
      // pagination and PR associations from both long-lived branches.
      const history = {
        repository: this.repository, logger: Object.fromEntries(['debug', 'info', 'warn'].map(key => [key, () => {}])),
        async graphqlRequest({ cursor }) {
          const offset = Number(cursor || 0), page = state.commits.slice(offset, offset + 2)
          return { repository: { ref: { target: { history: {
            nodes: page.map(c => ({ sha: c.sha, message: c.message, associatedPullRequests: { nodes: [{
              number: c.pullRequest?.number ?? 1, title: c.message.split('\n')[0],
              baseRefName: c.pullRequest?.baseBranchName ?? 'develop', headRefName: 'feat/test',
              body: '', mergeCommit: { oid: c.sha }, labels: { nodes: [] },
              files: { nodes: c.files.map(path => ({ path })), pageInfo: { hasNextPage: false } },
            }] } })),
            pageInfo: { hasNextPage: offset + 2 < state.commits.length, endCursor: String(offset + 2) },
          } } } } }
        },
        getCommitFiles: async sha => state.commits.find(c => c.sha === sha).files,
        mergeCommitsGraphQL: GitHub.prototype.mergeCommitsGraphQL,
      }
      yield* GitHub.prototype.mergeCommitIterator.call(history, branch, options)
    },
    async *pullRequestIterator(branch, status) {
      assert.equal(branch, 'main')
      yield* state.pulls.filter(pr => pr.status === status)
    },
    async createPullRequest(pr) {
      state.creates++
      const created = { ...pr, number: state.creates, status: 'OPEN' }
      state.pulls.push(created)
      return created
    },
    async updatePullRequest(number, pr) {
      state.updates++
      const existing = state.pulls.find(pr => pr.number === number)
      Object.assign(existing, { title: pr.title.toString(), body: pr.body.toString() })
      return existing
    },
    async createRelease(release, options) {
      state.publishAttempts++
      if (state.failPublish) throw new Error('simulated publication failure')
      const tagName = release.tag.toString()
      if (state.releases.some(r => r.tagName === tagName)) {
        throw new DuplicateReleaseError(new Error('already_exists'), tagName)
      }
      const published = { tagName, sha: release.sha, notes: release.notes,
        url: `https://example.invalid/releases/${tagName}`, ...options }
      state.releases.push(published)
      return published
    },
    async commentOnIssue() {
      if (state.failComment) throw new Error('simulated comment failure after publication')
    },
    async removeIssueLabels(labels, number) {
      const pr = state.pulls.find(pr => pr.number === number)
      pr.labels = pr.labels.filter(label => !labels.includes(label))
    },
    async addIssueLabels(labels, number) {
      state.pulls.find(pr => pr.number === number).labels.push(...labels)
    },
  }, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected GitHub access: ${String(key)}`)
      return target[key]
    },
  })
  return { state, files, github, manifest: () => Manifest.fromManifest(github, 'main') }
}

function rendered(pr, path, previous) {
  const update = pr.updates.find(update => update.path === path)
  assert.ok(update, `missing update for ${path}`)
  return update.updater.updateContent(previous)
}

async function mergeRelease(f) {
  const manifest = await f.manifest()
  const [candidate] = await manifest.buildPullRequests()
  await manifest.createPullRequests()
  const pr = f.state.pulls[0]
  Object.assign(pr, { status: 'MERGED', sha: 'c'.repeat(40), mergeCommitOid: 'c'.repeat(40) })
  for (const update of candidate.updates) {
    if (f.files.has(update.path) || update.createIfMissing) {
      f.files.set(update.path, update.updater.updateContent(f.files.get(update.path)))
    }
  }
  f.state.commits.unshift({ ...commit(pr.title, pr.mergeCommitOid), pullRequest: pr })
  return { manifest: await f.manifest(), pr, candidate }
}

test('configuration establishes the audited 1.0.0 baseline and an exclusive history boundary', async () => {
  const f = fixture()
  const manifest = await f.manifest()
  assert.equal(manifest.bootstrapSha, boundary)
  assert.equal(manifest.releasedVersions['.'].toString(), '1.0.0')
  assert.equal(manifest.repositoryConfig['.'].releaseType, 'node')
  const [pr] = await manifest.buildPullRequests()
  assert.equal(pr.version.toString(), '1.0.1')
  const changelog = rendered(pr, 'CHANGELOG.md', f.files.get('CHANGELOG.md'))
  assert.match(changelog, /repair navigation/)
  assert.doesNotMatch(changelog, /historical breaking|older breaking/)
  assert.equal(JSON.parse(rendered(pr, 'package.json', f.files.get('package.json'))).version, '1.0.1')
  assert.equal(JSON.parse(rendered(pr, '.release-please-manifest.json', f.files.get('.release-please-manifest.json')))['.'], '1.0.1')
  assert.ok(!pr.updates.some(update => update.path === 'pnpm-lock.yaml'))
  assert.ok(pr.updates.filter(update => /package-lock|npm-shrinkwrap/.test(update.path)).every(update => !update.createIfMissing))
})

for (const [message, version] of [
  ['fix: repair navigation', '1.0.1'],
  ['feat: add bookmarks', '1.1.0'],
  ['feat!: remove legacy routes', '2.0.0'],
  ['refactor!: remove old API', '2.0.0'],
  ['fix: revise API\n\nBREAKING CHANGE: remove old API response', '2.0.0'],
  ['perf: reduce render work', '1.0.1'],
]) {
  test(`${message.split('\n')[0]} proposes ${version}`, async () => {
    const [pr] = await (await fixture([message]).manifest()).buildPullRequests()
    assert.equal(pr.version.toString(), version)
  })
}

for (const type of ['docs', 'chore', 'ci', 'build', 'test', 'refactor']) {
  test(`${type} alone creates no release PR`, async () => {
    const f = fixture([`${type}: maintain tooling`])
    assert.deepEqual(await (await f.manifest()).createPullRequests(), [])
    assert.equal(f.state.creates, 0)
  })
}

test('eligible merges reuse one release PR and unchanged reruns are a no-op', async () => {
  const f = fixture()
  await (await f.manifest()).createPullRequests()
  const number = f.state.pulls[0].number
  await (await f.manifest()).createPullRequests()
  assert.equal(f.state.creates, 1)
  assert.equal(f.state.updates, 0)
  f.state.commits.unshift(commit('feat: add bookmarks', 'd'.repeat(40)))
  await (await f.manifest()).createPullRequests()
  assert.equal(f.state.creates, 1)
  assert.equal(f.state.updates, 1)
  assert.equal(f.state.pulls[0].number, number)
  assert.match(f.state.pulls[0].title, /1\.1\.0/)
  assert.match(f.state.pulls[0].body, /repair navigation/)
  assert.match(f.state.pulls[0].body, /add bookmarks/)
})

test('merging a release PR publishes vX.Y.Z at its merge commit with matching notes; rerun is empty', async () => {
  const f = fixture()
  const { manifest, pr, candidate } = await mergeRelease(f)
  // Publication must not tag a later main HEAD.
  f.state.commits.unshift(commit('docs: explain release', 'e'.repeat(40)))
  const [release] = await manifest.createReleases()
  assert.equal(release.tagName, 'v1.0.1')
  assert.equal(release.sha, pr.mergeCommitOid)
  assert.match(release.notes, /repair navigation/)
  assert.ok(rendered(candidate, 'CHANGELOG.md', read('CHANGELOG.md')).includes(release.notes.trim()))
  assert.equal(release.draft, false)
  assert.equal(release.prerelease, false)
  assert.deepEqual(pr.labels, ['autorelease: tagged'])
  assert.deepEqual(await (await f.manifest()).createReleases(), [])
  assert.equal(f.state.publishAttempts, 1)
  assert.deepEqual(await (await f.manifest()).createPullRequests(), [])
})

test('failed publication stays pending, blocks another PR, and can be retried', async () => {
  const f = fixture()
  const { manifest, pr } = await mergeRelease(f)
  f.state.failPublish = true
  await assert.rejects(manifest.createReleases(), /simulated publication failure/)
  assert.ok(pr.labels.includes('autorelease: pending'))
  f.state.commits.unshift(commit('feat: another change', 'e'.repeat(40)))
  assert.deepEqual(await (await f.manifest()).createPullRequests(), [])
  f.state.failPublish = false
  assert.equal((await manifest.createReleases()).length, 1)
  assert.equal(f.state.releases.length, 1)
})

test('failure after publication reconciles the existing release without duplicating it', async () => {
  const f = fixture()
  const { manifest, pr } = await mergeRelease(f)
  f.state.failComment = true
  await assert.rejects(manifest.createReleases(), /simulated comment failure/)
  assert.equal(f.state.releases.length, 1)
  f.state.failComment = false
  // Upstream marks the PR tagged then reports the duplicate; a third run is clean.
  await assert.rejects((await f.manifest()).createReleases(), DuplicateReleaseError)
  assert.deepEqual(pr.labels, ['autorelease: tagged'])
  assert.deepEqual(await (await f.manifest()).createReleases(), [])
  assert.equal(f.state.releases.length, 1)
})

test('checked-in package and manifest versions agree', () => {
  assert.equal(JSON.parse(read('package.json')).version, JSON.parse(read('.release-please-manifest.json'))['.'])
})

test('subsequent releases use the last release rather than replaying bootstrap history', async () => {
  const f = fixture(['feat: add bookmarks'])
  const { manifest } = await mergeRelease(f)
  await manifest.createReleases()
  f.state.commits.unshift(commit('fix: repair bookmarks', 'e'.repeat(40)))
  const [next] = await (await f.manifest()).buildPullRequests()
  assert.equal(next.version.toString(), '1.1.1')
  assert.match(next.body.toString(), /repair bookmarks/)
  assert.doesNotMatch(next.body.toString(), /add bookmarks|historical breaking/)
})

test('hidden types still include breaking changes; mixed changes take the highest bump', async () => {
  const f = fixture(['docs!: replace supported configuration', 'feat: add bookmarks', 'fix: repair navigation'])
  const [pr] = await (await f.manifest()).buildPullRequests()
  assert.equal(pr.version.toString(), '2.0.0')
  assert.match(pr.body.toString(), /BREAKING CHANGES/)
  assert.match(pr.body.toString(), /replace supported configuration/)
})

test('a nonconventional commit alone produces no release', async () => {
  assert.deepEqual(await (await fixture(['Update project documentation']).manifest()).createPullRequests(), [])
})

test('promotion includes individual develop commits once; release sync metadata never bumps', async () => {
  const f = fixture(['Merge pull request #10 from org/develop\n\nchore(promotion): promote develop to main', 'feat: add reader bookmarks', 'fix: repair bookmark navigation'])
  const [candidate] = await (await f.manifest()).buildPullRequests()
  assert.equal(candidate.version.toString(), '1.1.0')
  const notes = candidate.body.toString()
  assert.equal(notes.split('add reader bookmarks').length - 1, 1)
  assert.equal(notes.split('repair bookmark navigation').length - 1, 1)
  assert.doesNotMatch(notes, /promote develop/)
  await mergeRelease(f)
  await (await f.manifest()).createReleases()
  f.state.commits.unshift(commit('chore(sync): merge main into develop', '1a'.repeat(20)))
  f.state.commits.unshift(commit('Merge pull request #11 from org/develop\n\nchore(promotion): promote develop to main', '1b'.repeat(20)))
  assert.deepEqual(await (await f.manifest()).buildPullRequests(), [])
  f.state.commits.unshift(commit('fix: repair production bookmark', 'e'.repeat(40)))
  const [patch] = await (await f.manifest()).buildPullRequests()
  assert.equal(patch.version.toString(), '1.1.1')
  assert.match(patch.body.toString(), /repair production bookmark/)
  assert.doesNotMatch(patch.body.toString(), /add reader bookmarks|repair bookmark navigation|merge main into develop/)
})

test('ancestry adapter recovers older promoted work after a newer release boundary', async () => {
  const f = fixture(['fix: already released repair'])
  const { pr } = await mergeRelease(f)
  await (await f.manifest()).createReleases()
  const older = commit('feat: older concurrent develop work', 'ab'.repeat(20))
  const promotion = commit('chore(promotion): promote develop to main', 'cd'.repeat(20))
  // Chronological API history puts the newly reachable feature below the last release.
  f.state.commits.splice(1, 0, older)
  f.state.commits.unshift(promotion)
  assert.deepEqual(await (await f.manifest()).buildPullRequests(), []) // upstream bug reproduced
  await installAncestryHistory(f.github, { bootstrapSha: boundary, runGit: args => {
    if (args[0] === 'merge-base') { assert.equal(args[2], pr.mergeCommitOid); return '' }
    assert.deepEqual(args, ['rev-list', '--topo-order', `${pr.mergeCommitOid}..HEAD`])
    return [promotion.sha, older.sha].join('\n')
  } })
  const [candidate] = await (await f.manifest()).buildPullRequests()
  assert.equal(candidate.version.toString(), '1.1.0')
  assert.equal(candidate.body.toString().split('older concurrent develop work').length - 1, 1)
  assert.doesNotMatch(candidate.body.toString(), /already released repair/)
})

test('release runner refuses stale main before creating release metadata', async () => {
  const f = fixture()
  await assert.rejects(runRelease({ github: f.github, config: { 'bootstrap-sha': boundary },
    assertCurrent: async () => { throw new Error('main advanced') },
  }), /main advanced/)
  assert.equal(f.state.creates, 0)
  assert.equal(f.state.publishAttempts, 0)
})

test('release runner uses the pinned manifest for publication and then PR generation', async () => {
  const f = fixture()
  let checks = 0
  await runRelease({ github: f.github, config: { 'bootstrap-sha': boundary },
    assertCurrent: async () => { checks++ },
    runGit: args => args[0] === 'merge-base' ? '' : f.state.commits.slice(0, f.state.commits.findIndex(c => c.sha === boundary)).map(c => c.sha).join('\n'),
  })
  assert.equal(checks, 3)
  assert.equal(f.state.creates, 1)
  assert.equal(f.state.pulls[0].title, 'chore(main): release 1.0.1')
})

test('real generated release candidate passes trusted main policy and pins the root branch contract', async () => {
  const f = fixture()
  // Package renames must not silently change the release branch.
  f.files.set('package.json', JSON.stringify({ ...JSON.parse(f.files.get('package.json')), name: 'renamed-package' }))
  await (await f.manifest()).createPullRequests()
  const pr = f.state.pulls[0]
  assert.equal(pr.headBranchName, 'release-please--branches--main--components--nextjs-blog-cms')
  const [candidate] = await (await f.manifest()).buildPullRequests()
  const files = candidate.updates.filter(update => f.files.has(update.path)).map(update => update.path)
  assert.deepEqual([...files].sort(), ['.release-please-manifest.json', 'CHANGELOG.md', 'package.json'])
  assert.deepEqual(await validate('main', pr.headBranchName, {
    author: 'the-practical-engineer-releases[bot]', title: pr.title.toString(), labels: pr.labels, files,
  }), [])
})

for (const declaration of ['BREAKING CHANGE: already released retirement', '  BREAKING-CHANGE: already released retirement', 'feat!:copied retirement']) {
  test(`runner refuses copied promotion metadata: ${declaration}`, async () => {
    const f = fixture([`chore(promotion): promote develop to main\n\n${declaration}`, 'feat: new bulk actions'])
    await assert.rejects(runRelease({ github: f.github, config: { 'bootstrap-sha': boundary },
      assertCurrent: async () => {}, runGit: args => args[0] === 'merge-base' ? '' : f.state.commits.slice(0, 2).map(c => c.sha).join('\n'),
    }), /Breaking release metadata/)
    assert.equal(f.state.creates, 0)
    assert.equal(f.state.publishAttempts, 0)
  })
}

test('runner still creates a major for a genuinely new breaking feature', async () => {
  const f = fixture(['chore(promotion): promote develop to main', 'feat!: replace current API\n\nBREAKING CHANGE: migrate the new contract'])
  await runRelease({ github: f.github, config: { 'bootstrap-sha': boundary },
    assertCurrent: async () => {}, runGit: args => args[0] === 'merge-base' ? '' : f.state.commits.slice(0, 2).map(c => c.sha).join('\n'),
  })
  assert.equal(f.state.pulls[0].title, 'chore(main): release 2.0.0')
  assert.match(f.state.pulls[0].body.toString(), /migrate the new contract/)
})

test('main advancing during history preflight prevents release writes', async () => {
  const f = fixture()
  let checks = 0
  await assert.rejects(runRelease({ github: f.github, config: { 'bootstrap-sha': boundary },
    assertCurrent: async () => { if (++checks === 2) throw new Error('main advanced during preflight') },
    runGit: args => args[0] === 'merge-base' ? '' : f.state.commits[0].sha,
  }), /main advanced during preflight/)
  assert.equal(f.state.creates, 0)
  assert.equal(f.state.publishAttempts, 0)
})

// Actual ancestry newly reachable after v3.0.1, captured from main cf67b6d.
// Replay through the pinned GraphQL parser and manifest without network writes.
for (const newBreaking of [false, true]) {
  test(`audited historical retirement does not replay; new breaking=${newBreaking}`, async () => {
    const f = fixture()
    const released = '25bc3e6ceeb85fca3244964314e48c938bb4e881'
    f.files.set('package.json', JSON.stringify({ ...JSON.parse(f.files.get('package.json')), version: '3.0.1' }))
    f.files.set('.release-please-manifest.json', JSON.stringify({ '.': '3.0.1' }))
    f.state.releases = [{ tagName: 'v3.0.1', sha: released }]
    f.state.commits = JSON.parse(read('scripts/release/fixtures/recovery-history.json'))
    if (newBreaking) f.state.commits.unshift(commit('feat!: new reader API\n\nBREAKING CHANGE: migrate reader clients', 'de'.repeat(20)))
    const range = f.state.commits.map(c => c.sha)
    f.state.commits.push(commit('chore(main): release 3.0.1', released))
    await installAncestryHistory(f.github, { runGit: args => args[0] === 'merge-base' ? '' : range.join('\n') })
    const [candidate] = await (await f.manifest()).buildPullRequests()
    assert.equal(candidate.version.toString(), newBreaking ? '4.0.0' : '3.1.0')
    const notes = candidate.body.toString()
    assert.doesNotMatch(notes, /External CMS|Revoked CMS keys|retire legacy AI/)
    assert.equal(notes.split('add bulk delete and unpublish actions').length - 1, 1)
    assert.match(notes, /add resumable onboarding for new accounts/)
    if (newBreaking) assert.match(notes, /migrate reader clients/)
  })
}

for (const failure of ['new copied metadata', 'unverified release boundary']) {
  test(`historical recovery still refuses ${failure} before writes`, async () => {
    const f = fixture()
    const released = '25bc3e6ceeb85fca3244964314e48c938bb4e881'
    f.state.releases = [{ tagName: 'v3.0.1', sha: released }]
    f.state.commits = JSON.parse(read('scripts/release/fixtures/recovery-history.json'))
    if (failure === 'new copied metadata') f.state.commits.unshift(commit('chore(promotion): next promotion\n\nBREAKING CHANGE: copied again', 'fa'.repeat(20)))
    const range = f.state.commits.map(c => c.sha)
    f.state.commits.push(commit('chore(main): release 3.0.1', released))
    await assert.rejects(runRelease({ github: f.github, config: {}, assertCurrent: async () => {}, runGit: args => {
      if (args[0] === 'merge-base') {
        if (args[2] === released && args[3] === released && failure === 'unverified release boundary') throw new Error('unverified recovery boundary')
        return ''
      }
      return range.join('\n')
    } }), failure === 'new copied metadata' ? /Breaking release metadata/ : /unverified recovery boundary/)
    assert.equal(f.state.creates, 0)
    assert.equal(f.state.publishAttempts, 0)
  })
}
