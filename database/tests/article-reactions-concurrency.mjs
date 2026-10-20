// Designated disposable local database only; fixtures are removed in finally.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const exec = promisify(execFile)
const query = async sql => (await exec('docker', ['exec', 'supabase_db_nextjs-blog-cms', 'psql', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql])).stdout.trim()
const users = Array.from({ length: 12 }, () => randomUUID())
const post = randomUUID()
const asUser = (user, sql) => query(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{"sub":"${user}","role":"authenticated","aal":"aal1"}'; ${sql}; COMMIT;`)
const react = (user, type, selected) => asUser(user, `SELECT public.set_article_reaction('${post}','${type}',${selected})`)
try {
 await query(`INSERT INTO auth.users(id,email) VALUES ${users.map(id => `('${id}','${id}@article-reactions.example.test')`).join(',')};
 INSERT INTO public.posts(id,title,slug,content,status,author_id) VALUES('${post}','Concurrency','article-reaction-${post}','body','published','${users[0]}');`)
 await Promise.all(Array.from({ length: 20 }, () => react(users[0], 'love', true)))
 assert.equal(await query(`SELECT count(*) FROM public.article_reactions WHERE post_id='${post}'`), '1')
 assert.equal(await query(`SELECT changes FROM auth_private.article_reaction_budgets WHERE user_id='${users[0]}'`), '1')
 await Promise.all(['unicorn', 'mind_blown', 'celebrate', 'fire'].map(type => react(users[0], type, true)))
 assert.equal(await query(`SELECT count(*) FROM public.article_reactions WHERE post_id='${post}' AND user_id='${users[0]}'`), '5')
 await Promise.all(users.map(user => react(user, 'love', true)))
 const snapshot = JSON.parse(await asUser(users[0], `SELECT public.get_article_reactions('${post}')`))
 assert.deepEqual(snapshot.counts, { love: 12, unicorn: 1, mind_blown: 1, celebrate: 1, fire: 1 })
 await Promise.all(Array.from({ length: 20 }, (_,i) => react(users[1], 'fire', i%2===0)))
 assert.ok(Number(await query(`SELECT count(*) FROM public.article_reactions WHERE post_id='${post}' AND user_id='${users[1]}' AND reaction='fire'`)) <= 1)
 await Promise.all(users.flatMap(user => [react(user, 'love', false), react(user, 'love', false)]))
 assert.equal(await query(`SELECT count(*) FROM public.article_reactions WHERE post_id='${post}' AND reaction='love'`), '0')
 const inFlight = asUser(users[2], `SET LOCAL application_name='article-reaction-concurrency-barrier'; SELECT public.set_article_reaction('${post}','love',true); SELECT pg_sleep(2)`)
 for (let attempt=0; ; attempt++) {
  if (await query("SELECT count(*) FROM pg_stat_activity WHERE application_name='article-reaction-concurrency-barrier' AND wait_event='PgSleep'") === '1') break
  assert.ok(attempt<100, 'Reaction did not acquire its publication lock')
  await new Promise(resolve => setTimeout(resolve,20))
 }
 await query(`UPDATE public.posts SET status='draft' WHERE id='${post}'`)
 await inFlight
 await assert.rejects(react(users[2], 'fire', true), /REACTION_UNAVAILABLE/)
 assert.equal(await asUser(users[2], `SELECT public.get_article_reactions('${post}') IS NULL`), 't')
 console.log('PASS: duplicate retries, independent types, competing writes, 12-reader totals, removals and unpublication')
} finally {
 await query(`DELETE FROM public.posts WHERE id='${post}'; DELETE FROM auth.users WHERE id IN (${users.map(id => `'${id}'`).join(',')});`)
}
