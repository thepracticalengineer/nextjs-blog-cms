// Independent database connections exercise the real atomic RPC. Never targets a hosted DB.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
const exec = promisify(execFile)
const container = process.env.AUTH_ABUSE_TEST_CONTAINER ?? 'supabase_db_nextjs-blog-cms'
if (!['supabase_db_nextjs-blog-cms', 'cms-issue110-db'].includes(container)) throw new Error('Only designated disposable containers are allowed')
const ip = randomBytes(32).toString('hex'), account = randomBytes(32).toString('hex')
const query = async sql => (await exec('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', `set role service_role; ${sql}`])).stdout.trim()
try {
  const results = await Promise.all(Array.from({ length: 40 }, async () => JSON.parse(await query(`select public.reserve_auth_attempt('login', '${ip}', '${account}')`))))
  assert.equal(results.filter(result => result.allowed).length, 10, 'Only ten requests may pass across connections')
  assert.equal(results.filter(result => !result.allowed).length, 30)
  assert.ok(results.filter(result => !result.allowed).every(result => result.retry_after > 0 && result.retry_after <= 600))
  console.log('Auth abuse concurrency: 10 allowed, 30 blocked across 40 independent connections')
} finally {
  await query(`delete from public.auth_attempt_buckets where bucket_key in ('login:ip:${ip}', 'login:account:${account}')`)
}
