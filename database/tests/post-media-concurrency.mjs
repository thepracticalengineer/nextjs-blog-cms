// Real independent Postgres connections. Only this repository's disposable container.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID, randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
const exec = promisify(execFile)
const database = process.env.MEDIA_TEST_DATABASE ?? 'postgres'
if (!['postgres', 'issue168_verify'].includes(database)) throw new Error('Only designated disposable databases are allowed')
const query = async sql => (await exec('docker', ['exec', 'supabase_db_nextjs-blog-cms', 'psql', '-U', 'postgres', '-d', database, '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql])).stdout.trim()
const owner = randomUUID()
const digest = randomBytes(32).toString('hex')
try {
  await query(`insert into auth.users(id, email, raw_user_meta_data) values ('${owner}', '${owner}@example.test', '{"full_name":"Concurrency fixture"}')`)
  const results = await Promise.all(Array.from({ length: 20 }, async () => {
    const path = `${owner}/${randomUUID()}.webp`
    return JSON.parse(await query(`set role service_role; select public.reserve_post_media('${owner}', '${digest}', '${path}', 'https://test/${path}')`))
  }))
  assert.equal(new Set(results.map(result => result.path)).size, 1, 'Concurrent identical uploads must reserve one immutable key')
  assert.equal(Number(await query(`select count(*) from public.post_media where owner_id = '${owner}'`)), 1)
  console.log('Media concurrency: 20 independent connections reserved exactly one owner/content path')
} finally {
  await query(`delete from public.post_media where owner_id = '${owner}'; delete from auth.users where id = '${owner}'`)
}
