import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backfillPostMedia } from './lib/backfill-post-media.mjs'

function fixture(count = 3) {
  const rows = Array.from({ length: count }, (_, index) => ({ path: `owner/${index}.webp`, state: 'active', content_sha256: null, hash_checked_at: null }))
  const downloads = []
  let failure
  const db = {
    from() {
      const filters = []
      let size = Infinity, values, head = false
      const query = {
        select(_columns, options) { head = !!options?.head; return query },
        update(next) { values = next; return query },
        eq(key, value) { filters.push(row => row[key] === value); return query },
        is(key, value) { filters.push(row => row[key] === value); return query },
        order() { return query },
        limit(next) { size = next; return query },
        then(resolve) {
          const allMatches = rows.filter(row => filters.every(filter => filter(row)))
          const matches = allMatches.slice(0, size)
          if (values) matches.forEach(row => Object.assign(row, values))
          return Promise.resolve({ data: head ? null : matches.map(row => ({ ...row })), count: allMatches.length, error: null }).then(resolve)
        },
      }
      return query
    },
    storage: { from: () => ({ download: async path => {
      downloads.push(path)
      if (failure) return { error: failure }
      return path === 'owner/1.webp' ? { error: { code: 'NoSuchKey', statusCode: '404' } } : { data: new Blob(['abc']), error: null }
    } }) },
  }
  return { db, rows, downloads, fail: error => { failure = error } }
}

test('dry run counts pending legacy rows without downloading or updating objects', async () => {
  const f = fixture()
  assert.deepEqual(await backfillPostMedia(f.db), { pending: 3, hashed: 0, missing: 0 })
  assert.equal(f.downloads.length, 0)
  assert.ok(f.rows.every(row => row.hash_checked_at === null))
})

test('resumable batches hash existing bytes, mark missing objects once and preserve objects', async () => {
  const f = fixture(53)
  const result = await backfillPostMedia(f.db, { apply: true })
  assert.deepEqual(result, { pending: 0, hashed: 52, missing: 1 })
  assert.equal(f.rows[0].content_sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(f.rows[1].content_sha256, null)
  assert.ok(f.rows.every(row => row.hash_checked_at && row.state === 'active'))
  assert.equal(f.downloads.length, 53)
  assert.deepEqual(await backfillPostMedia(f.db, { apply: true }), { pending: 0, hashed: 0, missing: 0 })
  assert.equal(f.downloads.length, 53)
})

test('transient storage failure remains pending and succeeds on a later run', async () => {
  const f = fixture(1)
  f.fail({ statusCode: '503', message: 'Unavailable' })
  await assert.rejects(backfillPostMedia(f.db, { apply: true }), /download/i)
  assert.equal(f.rows[0].hash_checked_at, null)
  f.fail(undefined)
  assert.equal((await backfillPostMedia(f.db, { apply: true })).hashed, 1)
})

test('already hashed and deleting objects are excluded from backfill', async () => {
  const f = fixture(2)
  f.rows[0].content_sha256 = 'existing-digest'
  f.rows[1].state = 'deleting'
  assert.deepEqual(await backfillPostMedia(f.db, { apply: true }), { pending: 0, hashed: 0, missing: 0 })
  assert.equal(f.downloads.length, 0)
})
