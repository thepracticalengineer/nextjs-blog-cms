// Run only with disposable test credentials: node scripts/benchmark-post-lists.mjs
// Optional production-build app comparison: --before-url http://localhost:3076 --after-url http://localhost:3077
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { assertDedicatedTestProject } from '../e2e/environment.ts'

config({ path: '.env.e2e', quiet: true })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Configure disposable .env.e2e credentials first')
assertDedicatedTestProject(url, process.env.E2E_SUPABASE_PROJECT_REF)
const args = process.argv.slice(2)
const beforeUrl = args.includes('--before-url') ? args[args.indexOf('--before-url') + 1] : undefined
const afterUrl = args.includes('--after-url') ? args[args.indexOf('--after-url') + 1] : undefined
for (const app of [beforeUrl, afterUrl].filter(Boolean)) {
  if (!['localhost', '127.0.0.1'].includes(new URL(app).hostname)) throw new Error('Browser benchmarks require local app servers using the same disposable database')
}
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const prefix = `perf77-${randomUUID()}`
const email = `${prefix}@example.com`
const password = randomBytes(24).toString('base64url') + 'aA1!'
const rawKey = `fmblog_${randomBytes(32).toString('hex')}`
const samples = 7
const count = 1500
const sentence = 'A reliable engineering system records each request before applying a change and verifies the result before returning a response. '
const content = '<p>' + Array.from({ length: 80 }, (_, n) => `Section ${n + 1}. ${sentence}`).join('</p><p>') + '</p>'
const queriesSource = readFileSync(new URL('../features/posts/queries.ts', import.meta.url), 'utf8')
const fullSelect = queriesSource.match(/export const POST_SELECT = `([\s\S]*?)`/)[1]
const summarySelect = queriesSource.match(/export const PUBLIC_POST_SELECT = `([\s\S]*?)`/)[1]
const check = result => { if (result.error) throw result.error; return result.data }
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const stats = values => ({ median: Math.round(median(values) * 100) / 100, min: Math.round(Math.min(...values) * 100) / 100, max: Math.round(Math.max(...values) * 100) / 100 })
async function measureQuery(run) {
  await run() // warmup
  const elapsed = []; let data
  for (let i = 0; i < samples; i++) {
    const start = performance.now(); data = check(await run()); elapsed.push(performance.now() - start)
  }
  return { roundTripMs: stats(elapsed), jsonBytes: Buffer.byteLength(JSON.stringify(data)), rows: Array.isArray(data) ? data.length : data.posts.length }
}
let userId; let browser; let categoryId; let tagId
try {
  const user = check(await admin.auth.admin.createUser({ email, password, email_confirm: true }))
  userId = user.user.id
  check(await admin.from('profiles').update({ role: 'author', full_name: 'Performance Fixture Author' }).eq('id', userId))
  categoryId = check(await admin.from('categories').insert({ name: prefix, slug: prefix }).select('id').single()).id
  tagId = check(await admin.from('tags').insert({ name: prefix, slug: prefix }).select('id').single()).id
  check(await admin.from('api_keys').insert({ user_id: userId, name: 'Disposable benchmark', key_hash: createHash('sha256').update(rawKey).digest('hex'), key_preview: 'benchmark', is_active: true }))
  let editorId
  for (let offset = 0; offset < count; offset += 100) {
    const rows = check(await admin.from('posts').insert(Array.from({ length: Math.min(100, count - offset) }, (_, n) => ({
      author_id: userId, title: `Reliable request handling ${String(offset + n).padStart(4, '0')}`, slug: `${prefix}-${offset + n}`,
      content, excerpt: 'Practical techniques for reliable request processing, durable writes and predictable recovery in engineering systems.',
      status: offset + n === 0 ? 'draft' : 'published', published_at: offset + n === 0 ? null : '2026-01-01T00:00:00Z', category_id: categoryId,
    }))).select('id'))
    if (!editorId) editorId = rows[0].id
    check(await admin.from('post_tags').insert(rows.map(p => ({ post_id: p.id, tag_id: tagId }))))
  }
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  check(await client.auth.signInWithPassword({ email, password }))
  const publicClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = { dataset: { posts: count, bodyBytes: Buffer.byteLength(content), samples, database: 'dedicated test project', note: 'Both query shapes use the migrated schema; timings include local HTTP and JSON decoding, not just SQL execution.' }, queries: {} }
  result.queries.dashboardBefore = await measureQuery(() => client.from('posts').select(fullSelect).eq('author_id', userId).order('updated_at', { ascending: false }))
  result.queries.dashboardAfter = await measureQuery(() => client.rpc('get_dashboard_posts', { p_page: 1, p_page_size: 10 }))
  result.queries.publicBefore = await measureQuery(() => publicClient.from('posts').select(fullSelect, { count: 'exact' }).eq('status', 'published').order('published_at', { ascending: false }).range(0, 9))
  result.queries.publicAfter = await measureQuery(() => publicClient.from('posts').select(summarySelect, { count: 'exact' }).eq('status', 'published').order('published_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).range(0, 9))
  if (beforeUrl && afterUrl) {
    browser = await chromium.launch({ headless: true })
    result.browser = {}
    for (const [label, base] of [['before', beforeUrl], ['after', afterUrl]]) {
      const page = await browser.newPage()
      await page.goto(`${base}/login`)
      await page.getByLabel('Email address').fill(email)
      await page.getByLabel('Password', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await page.waitForURL('**/dashboard')
      const dashboard = []; const readiness = []; const publish = []; let htmlBytes
      for (let i = 0; i <= samples; i++) {
        let start = performance.now()
        await page.goto(`${base}/dashboard/posts`)
        await page.getByRole('button', { name: 'Next page' }).waitFor()
        if (i) dashboard.push(performance.now() - start)
        start = performance.now()
        await page.goto(`${base}/dashboard/posts/${editorId}/edit`)
        await page.locator('[contenteditable="true"]').waitFor()
        await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeEnabled()
        if (i) readiness.push(performance.now() - start)
        start = performance.now()
        // Synthetic fixture only: exercise the supported REST publication contract.
        const published = await page.request.patch(`${base}/api/posts/${editorId}`, { headers: { Authorization: `Bearer ${rawKey}` }, data: { status: 'published', editorial_reviewed: true } })
        if (published.status() !== 200) throw new Error(`Publish failed: ${await published.text()}`)
        if (i) publish.push(performance.now() - start)
        const unpublished = await page.request.patch(`${base}/api/posts/${editorId}`, { headers: { Authorization: `Bearer ${rawKey}` }, data: { status: 'draft' } })
        if (unpublished.status() !== 200) throw new Error(`Unpublish failed: ${await unpublished.text()}`)
      }
      htmlBytes = Buffer.byteLength(await (await page.request.get(`${base}/dashboard/posts`)).text())
      result.browser[label] = { dashboardReadyMs: stats(dashboard), dashboardHtmlBytes: htmlBytes, editorReadyMs: stats(readiness), restPublishCompletionMs: stats(publish) }
      await page.close()
    }
  }
  console.log(JSON.stringify(result, null, 2))
} finally {
  if (browser) await browser.close()
  if (userId) {
    check(await admin.from('posts').delete().eq('author_id', userId))
    check(await admin.auth.admin.deleteUser(userId))
  }
  if (tagId) check(await admin.from('tags').delete().eq('id', tagId))
  if (categoryId) check(await admin.from('categories').delete().eq('id', categoryId))
}
