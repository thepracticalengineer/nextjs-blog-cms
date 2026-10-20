import assert from 'node:assert/strict'
import { test } from 'node:test'
import { synchronize } from './sync.mjs'

function fixture({ ahead = 1, files = [{ filename: 'package.json' }], existing = false, mergeable = true, race = false } = {}) {
  const writes = [], failures = [], notices = []
  const pr = { number: 17, html_url: 'https://example.invalid/pull/17', mergeable, head: { ref: 'main', repo: { full_name: 'org/repo' } }, base: { ref: 'develop' } }
  let pending = existing
  const github = { rest: {
    repos: { compareCommitsWithBasehead: async args => {
      assert.equal(args.basehead, 'develop...main')
      return { data: { ahead_by: ahead, files } }
    } },
    pulls: {
      list: async args => { assert.equal(args.base, 'develop'); assert.equal(args.head, 'org:main'); return { data: pending ? [pr] : [] } },
      create: async args => { writes.push(args); pending = true; if (race) throw Object.assign(new Error('already exists'), { status: 422 }); return { data: pr } },
      get: async () => ({ data: pr }),
    },
  }, paginate: async (method, args) => (await method(args)).data }
  const core = { notice: value => notices.push(value), setFailed: value => failures.push(value), summary: { addRaw() { return this }, async write() {} } }
  return { writes, failures, notices, args: { github, core, owner: 'org', repo: 'repo', wait: async () => {} } }
}
test('release/hotfix creates one reviewed main-to-develop PR without changing branch refs', async () => {
  const f = fixture()
  assert.equal((await synchronize(f.args)).status, 'open')
  assert.equal(f.writes[0].head, 'main')
  assert.equal(f.writes[0].base, 'develop')
  assert.match(f.writes[0].title, /^chore\(sync\):/)
  await synchronize(f.args)
  assert.equal(f.writes.length, 1)
})
test('existing sync follows main naturally and preserves simultaneous develop work', async () => {
  const f = fixture({ existing: true })
  assert.equal((await synchronize(f.args)).number, 17)
  assert.equal(f.writes.length, 0)
})
for (const options of [{ ahead: 0 }, { files: [] }]) {
  test(`no-op when main is contained or promotion adds only ancestry: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options)
    assert.equal((await synchronize(f.args)).status, 'synchronized')
    assert.equal(f.writes.length, 0)
  })
}
test('creation race reuses the PR instead of making duplicates', async () => {
  const f = fixture({ race: true })
  assert.equal((await synchronize(f.args)).number, 17)
  assert.equal(f.failures.length, 0)
})
for (const mergeable of [false, null]) {
  test(`conflict or unknown mergeability (${mergeable}) reports action required and retains PR`, async () => {
    const f = fixture({ existing: true, mergeable })
    assert.equal((await synchronize(f.args)).status, 'attention')
    assert.equal(f.failures.length, 1)
    assert.match(f.failures[0], /17/)
    assert.equal(f.writes.length, 0)
  })
}
test('API permission errors propagate rather than claiming synchronization', async () => {
  const f = fixture()
  f.args.github.rest.pulls.create = async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }) }
  await assert.rejects(synchronize(f.args), /Forbidden/)
})

test('unknown mergeability is polled sequentially and stops as soon as it becomes known', async () => {
  const f = fixture({ existing: true })
  let reads = 0
  const events = []
  f.args.github.rest.pulls.get = async () => {
    events.push('read')
    return { data: { number: 17, html_url: 'https://example.invalid/pull/17', mergeable: ++reads < 3 ? null : true } }
  }
  f.args.wait = async ms => { assert.equal(ms, 2000); events.push('wait') }
  assert.equal((await synchronize(f.args)).status, 'open')
  assert.deepEqual(events, ['read', 'wait', 'read', 'wait', 'read'])
  assert.equal(f.failures.length, 0)
})

test('unknown mergeability never exceeds three API reads and two waits', async () => {
  const f = fixture({ existing: true, mergeable: null })
  let reads = 0, waits = 0
  const original = f.args.github.rest.pulls.get
  f.args.github.rest.pulls.get = async () => { reads++; return original() }
  f.args.wait = async () => { waits++ }
  assert.equal((await synchronize(f.args)).status, 'attention')
  assert.equal(reads, 3)
  assert.equal(waits, 2)
  assert.equal(f.failures.length, 1)
})
