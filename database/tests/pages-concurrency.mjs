// Real independent PostgreSQL sessions; accepts only designated disposable targets.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const exec = promisify(execFile)
const container = 'supabase_db_nextjs-blog-cms'
const database = process.env.PAGES_TEST_DATABASE ?? 'postgres'
const user = process.env.PAGES_TEST_USER ?? 'postgres'
if (!['postgres', 'cms_issue286'].includes(database) || !['postgres', 'supabase_admin'].includes(user)) throw new Error('Only disposable page test databases are allowed')
const sql = value => `'${String(value).replaceAll("'", "''")}'`
const query = async statement => (await exec('docker', ['exec', container, 'psql', '-U', user, '-d', database, '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim()
const actor = randomUUID()
const slug = `pages-race-${randomUUID()}`
const values = { title: 'Race', slug, seo_title: '', seo_description: '', document: { version: 1, blocks: [{ type: 'paragraph', text: 'Content' }] } }
const write = async (operation, key, payload = null, page = null) => {
  const payloadSql = payload ? `${sql(JSON.stringify(payload))}::jsonb` : 'NULL'
  const pageSql = page ? `${sql(page.id)}::uuid,${sql(page.revision)}::uuid` : 'NULL,NULL'
  return JSON.parse(await query(`
    BEGIN; SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: actor, role: 'authenticated', aal: 'aal1' })}';
    SELECT public.write_page_atomic(${sql(operation)},${sql(key)},${payloadSql},${pageSql},${operation === 'publish'});
    COMMIT;
  `))
}
try {
  const email = `${actor}@example.test`
  await query(`INSERT INTO auth.users(id,email) VALUES(${sql(actor)},${sql(email)}); UPDATE public.profiles SET role='admin' WHERE id=${sql(actor)}`)
  const creates = await Promise.all(Array.from({ length: 12 }, () => write('create', 'create', values)))
  assert.equal(creates.filter(result => !result.replayed).length, 1)
  assert.equal(new Set(creates.map(result => result.page.id)).size, 1)
  const page = creates[0].page
  const saves = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => write('save', `save-${index}`, { ...values, title: `Edit ${index}` }, page)))
  assert.equal(saves.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(saves.filter(result => result.status === 'rejected' && result.reason.stderr.includes('PAGE_STALE')).length, 11)
  const winner = saves.find(result => result.status === 'fulfilled').value.page
  const publications = await Promise.all(Array.from({ length: 12 }, () => write('publish', 'publish', null, winner)))
  assert.equal(publications.filter(result => !result.replayed).length, 1)
  assert.equal(new Set(publications.map(result => result.page.revision)).size, 1)
  const live = JSON.parse(await query(`SELECT to_jsonb(s) FROM public.page_snapshots s WHERE page_id=${sql(page.id)}`))
  assert.equal(live.title, winner.title)
  const replay = await write('create', 'create', values)
  assert.equal(replay.page.revision, publications[0].page.revision)
  assert.equal(replay.replayed, true)
  // Two distinct requests for the same new slug: loser must leave no page/receipt.
  const clash = await Promise.allSettled([write('create', 'clash-a', { ...values, slug: `${slug}-clash` }), write('create', 'clash-b', { ...values, slug: `${slug}-clash` })])
  assert.equal(clash.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(clash.filter(result => result.status === 'rejected' && result.reason.stderr.includes('PAGE_SLUG_CONFLICT')).length, 1)
  assert.equal(Number(await query(`SELECT count(*) FROM public.pages WHERE created_by=${sql(actor)}`)), 2)
  assert.equal(Number(await query(`SELECT count(*) FROM public.page_write_requests WHERE actor_id=${sql(actor)} AND request_key LIKE 'clash-%'`)), 1)
  // A simultaneous draft rename must never make its still-live slug claimable.
  const published = publications[0].page
  const renamed = `${slug}-renamed`
  const liveRace = await Promise.allSettled([
    write('save', 'rename-live', { ...values, slug: renamed }, published),
    ...Array.from({ length: 8 }, (_, index) => write('create', `steal-live-${index}`, values)),
  ])
  assert.equal(liveRace[0].status, 'fulfilled')
  assert.equal(liveRace.slice(1).filter(result => result.status === 'rejected' && result.reason.stderr.includes('PAGE_SLUG_CONFLICT')).length, 8)
  const draft = liveRace[0].value.page
  assert.equal(Number(await query(`SELECT count(*) FROM public.page_slug_reservations WHERE page_id=${sql(page.id)}`)), 2)
  // Once publication retires the old live slug, another page can claim it.
  await write('publish', 'publish-renamed', null, draft)
  const reused = await write('create', 'reuse-retired-live', values)
  assert.notEqual(reused.page.id, page.id)
  assert.equal(Number(await query(`SELECT count(*) FROM public.page_slug_reservations WHERE page_id=${sql(page.id)}`)), 1)
  console.log('Pages: concurrent creation/retries, stale saves, publication retries, slug conflicts and live-slug retention/release passed')
} finally {
  await query(`DELETE FROM public.pages WHERE created_by=${sql(actor)}; DELETE FROM auth.users WHERE id=${sql(actor)}`)
}
