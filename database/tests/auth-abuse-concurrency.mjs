// Independent connections exercise real atomic RPCs. Never targets a hosted DB.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
const exec = promisify(execFile)
const container = process.env.AUTH_ABUSE_TEST_CONTAINER ?? 'supabase_db_nextjs-blog-cms'
if (!['supabase_db_nextjs-blog-cms', 'cms-issue110-db'].includes(container)) throw new Error('Only designated disposable containers are allowed')
const key = () => randomBytes(32).toString('hex')
const cleanup = new Set()
const query = async sql => (await exec('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', `set role service_role; ${sql}`])).stdout.trim()
const reserve = async (action, ip, account, bot = false) => {
  cleanup.add(`${action}:ip:${ip}`); cleanup.add(`${action}:account:${account}`)
  const first = JSON.parse(await query(`select public.reserve_auth_attempt('${action}', '${ip}', '${account}', false, false, false, 'ip', 0)`))
  if (!first.allowed) return first
  return JSON.parse(await query(`select public.reserve_auth_attempt('${action}', '${ip}', '${account}', ${bot}, false, false, 'account', ${first.ip_attempts})`))
}
try {
  const ip = key(), account = key()
  const hard = await Promise.all(Array.from({ length: 40 }, () => reserve('password', ip, account)))
  assert.equal(hard.filter(result => result.allowed).length, 10)
  assert.equal(hard.filter(result => !result.allowed).length, 30)
  const login = await Promise.all(Array.from({ length: 40 }, () => reserve('login', ip, account)))
  assert.equal(login.filter(result => result.allowed).length, 40, 'Successful logins never charge account failures')
  assert.equal(Number(await query(`select attempts from public.auth_attempt_buckets where bucket_key = 'login:ip:${ip}'`)), 40, 'Account finalization must not charge IP twice')
  const email = await Promise.all(Array.from({ length: 40 }, () => reserve('recovery', key(), account, true)))
  assert.equal(email.filter(result => result.allowed && !result.challenge_required).length, 3, 'Concurrent first-use accounts must escalate atomically')
  assert.equal(email.filter(result => result.challenge_required).length, 37)
  console.log('Auth concurrency: password 10/30 allowed/blocked; login 40 allowed; recovery 3 admitted/37 challenged across distinct IPs')
} finally {
  await query(`delete from public.auth_attempt_buckets where bucket_key in (${[...cleanup].map(value => `'${value}'`).join(',')})`)
}
