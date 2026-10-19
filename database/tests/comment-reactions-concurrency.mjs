// Designated disposable local container only; no hosted DB or external effects.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const exec = promisify(execFile)
const container = 'supabase_db_nextjs-blog-cms'
const query = async sql => (await exec('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql])).stdout.trim()
const users = Array.from({ length: 12 }, () => randomUUID())
const post = randomUUID(), comment = randomUUID()
const asUser = (user, sql) => query(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{"sub":"${user}","role":"authenticated","aal":"aal1"}'; ${sql}; COMMIT;`)
const react = (user, type) => asUser(user, `SELECT public.set_comment_reaction('${comment}',${type === null ? 'NULL' : `'${type}'`})`)
try {
 await query(`INSERT INTO auth.users(id,email) VALUES ${users.map(id => `('${id}','${id}@reactions.example.test')`).join(',')};
 INSERT INTO public.posts(id,title,slug,content,status,author_id) VALUES('${post}','Concurrency','reaction-${post}','body','published','${users[0]}');
 INSERT INTO public.comments(id,post_id,author_id,content) VALUES('${comment}','${post}','${users[0]}','comment');`)
 await Promise.all(Array.from({ length: 20 }, () => react(users[0],'like')))
 assert.equal(await query(`SELECT count(*) FROM public.comment_reactions WHERE comment_id='${comment}'`),'1')
 assert.equal(await query(`SELECT changes FROM auth_private.comment_reaction_budgets WHERE user_id='${users[0]}'`),'1')
 await Promise.all(users.map(user => react(user,'love')))
 const counts = JSON.parse(await asUser(users[0], `SELECT counts FROM public.get_comment_reactions('${post}')`))
 assert.deepEqual(counts, { like: 0, love: 12, celebrate: 0, insightful: 0 })
 await Promise.all(Array.from({ length: 20 }, (_,i) => react(users[0], i%2 ? 'celebrate' : 'insightful')))
 assert.equal(await query(`SELECT count(*) FROM public.comment_reactions WHERE comment_id='${comment}' AND user_id='${users[0]}'`),'1')
 await Promise.all(users.flatMap(user => [react(user,null),react(user,null)]))
 assert.equal(await query(`SELECT count(*) FROM public.comment_reactions WHERE comment_id='${comment}'`),'0')
 // Publication update waits for an in-flight reaction's share lock, then the
 // next write is denied. No mutation can commit after a hidden-state check.
 const inFlight = asUser(users[1], `SET LOCAL application_name='reaction-concurrency-barrier'; SELECT public.set_comment_reaction('${comment}','like'); SELECT pg_sleep(2)`)
 for (let attempt=0; ; attempt++) {
  if (await query("SELECT count(*) FROM pg_stat_activity WHERE application_name='reaction-concurrency-barrier' AND wait_event='PgSleep'") === '1') break
  assert.ok(attempt<100,'Reaction did not acquire its publication lock')
  await new Promise(resolve => setTimeout(resolve,20))
 }
 await query(`UPDATE public.posts SET status='draft' WHERE id='${post}'`)
 await inFlight
 await assert.rejects(react(users[1],'love'), /REACTION_UNAVAILABLE/)
 console.log('PASS: concurrent retries, competing selections, 12-reader totals, removals and unpublication')
} finally {
 await query(`DELETE FROM public.posts WHERE id='${post}'; DELETE FROM auth.users WHERE id IN (${users.map(id => `'${id}'`).join(',')});`)
}
