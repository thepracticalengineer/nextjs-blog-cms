// Designated disposable local container only. No hosted DB, mail or webhooks.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const exec = promisify(execFile)
const query = async sql => (await exec('docker', ['exec', 'supabase_db_nextjs-blog-cms', 'psql', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql])).stdout.trim()
const user = randomUUID(), post = randomUUID(), otherPost = randomUUID(), request = randomUUID()
const asUser = sql => query(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{"sub":"${user}","role":"authenticated","aal":"aal1"}'; ${sql}; COMMIT;`)
const write = (id, target = post) => asUser(`SELECT public.create_comment('${target}','identical text','${id}')`)
try {
 await query(`INSERT INTO auth.users(id,email) VALUES('${user}','${user}@comments.example.test');
 INSERT INTO public.posts(id,title,slug,content,status,author_id) VALUES
 ('${post}','Concurrency','comments-${post}','body','published','${user}'),
 ('${otherPost}','Other','comments-${otherPost}','body','published','${user}');`)
 const retries = await Promise.all(Array.from({ length: 20 }, () => write(request)))
 assert.equal(new Set(retries).size, 1)
 assert.equal(await query(`SELECT count(*) FROM public.comments WHERE author_id='${user}'`), '1')
 assert.equal(await query(`SELECT minute_used FROM auth_private.comment_write_budgets WHERE user_id='${user}'`), '1')
 const burst = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => write(randomUUID(), i % 2 ? post : otherPost)))
 assert.equal(burst.filter(r => r.status === 'fulfilled').length, 4)
 for (const result of burst.filter(r => r.status === 'rejected')) assert.match(result.reason.message, /COMMENT_RATE_LIMIT/)
 assert.equal(await query(`SELECT count(*) FROM public.comments WHERE author_id='${user}'`), '5')
 await write(request) // retry succeeds at the limit
 await query(`DELETE FROM public.comments WHERE author_id='${user}';`)
 await write(request)
 assert.equal(await query(`SELECT count(*) FROM public.comments WHERE author_id='${user}'`), '0')
 await assert.rejects(write(randomUUID()), /COMMENT_RATE_LIMIT/) // deletion never refunds
 await query(`UPDATE auth_private.comment_write_budgets SET minute_start=now()-interval '2 minutes',hour_used=29 WHERE user_id='${user}'`)
 const hourBurst = await Promise.allSettled(Array.from({ length: 12 }, () => write(randomUUID())))
 assert.equal(hourBurst.filter(r => r.status === 'fulfilled').length, 1)
 await query(`UPDATE auth_private.comment_write_budgets SET hour_start=now()-interval '2 hours' WHERE user_id='${user}'`)
 await write(randomUUID())
 // An unpublish waits for the write's parent lock, then blocks new submissions.
 const inFlight = asUser(`SET LOCAL application_name='comment-writes-barrier'; SELECT public.create_comment('${post}','in flight','${randomUUID()}'); SELECT pg_sleep(2)`)
 for (let attempt=0; ; attempt++) {
  if (await query("SELECT count(*) FROM pg_stat_activity WHERE application_name='comment-writes-barrier' AND wait_event='PgSleep'") === '1') break
  assert.ok(attempt < 100, 'Comment did not acquire its publication lock')
  await new Promise(resolve => setTimeout(resolve,20))
 }
 await query(`UPDATE public.posts SET status='draft' WHERE id='${post}'`)
 await inFlight
 await assert.rejects(write(randomUUID()), /COMMENT_UNAVAILABLE/)
 console.log('PASS: concurrent deduplication, cross-post minute/hour limits, deletion, recovery and unpublication')
} finally {
 await query(`DELETE FROM public.posts WHERE id IN ('${post}','${otherPost}'); DELETE FROM auth.users WHERE id='${user}'`)
}
