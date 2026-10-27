// Independent connections against the repository's disposable database only.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const exec = promisify(execFile)
const query = async sql => (await exec('docker', ['exec', 'supabase_db_nextjs-blog-cms', 'psql', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql])).stdout.trim()
const owner = randomUUID()
const waitForLockHolder = async marker => {
 for (let i = 0; i < 100; i++) {
  if (await query(`select count(*) from pg_stat_activity where wait_event = 'PgSleep' and query like '%${marker}%'`) === '1') return
  await new Promise(resolve => setTimeout(resolve, 20))
 }
 throw new Error('Lock holder did not reach barrier')
}
try {
 await query(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@example.test','{"full_name":"Library race"}')`)
 const create = async () => {
  const id = randomUUID(), path = `${owner}/${randomUUID()}.webp`
  await query(`insert into public.post_media(id,path,url,owner_id,upload_status,created_at) values('${id}','${path}','https://test/${path}','${owner}','ready',now()-interval '8 days')`)
  return { id, path }
 }
 for (const changes of ['{}', '{"archived":true}']) {
  const { id, path } = await create()
  const marker = `library_wins_${id}`
  const holder = query(`begin; select public.mutate_media_library('${owner}','${id}','${changes}',${changes === '{}'}); select pg_sleep(1); commit; -- ${marker}`)
  await waitForLockHolder(marker)
  assert.equal(await query(`select count(*) from public.claim_abandoned_post_media(100) where id='${id}'`), '0', 'Cleanup must skip selection/archive lock')
  const retry = changes !== '{}' ? query(`select public.complete_post_media('${owner}','${path}','duplicate.png',1,1,1,true)`) : null
  await holder
  if (retry) {
   assert.equal(await retry, 't')
   assert.equal(await query(`select archived_at is not null and library_retained from public.post_media where id='${id}'`), 't', 'Concurrent completion must not restore an archive or erase retention')
  }
  assert.equal(await query(`select count(*) from public.claim_abandoned_post_media(100) where id='${id}'`), '0', 'Durable intent must survive after commit')
 }
 const { id, path } = await create()
 const marker = `cleanup_wins_${id}`
 const holder = query(`begin; select count(*) from public.claim_abandoned_post_media(100) where id='${id}'; select pg_sleep(1); commit; -- ${marker}`)
 await waitForLockHolder(marker)
 const completion = query(`select public.complete_post_media('${owner}','${path}','retry.png',1,1,1,true)`)
 const selection = query(`select public.mutate_media_library('${owner}','${id}','{}',true) is null`)
 await holder
 assert.equal(await completion, 'f', 'Completion must not revive cleanup winner')
 assert.equal(await selection, 't', 'Selection must not revive cleanup winner')
 console.log('Library races passed: select/archive protect cleanup; cleanup blocks completion and selection')
} finally {
 await query(`delete from public.post_media where owner_id='${owner}'; delete from auth.users where id='${owner}'`)
}
