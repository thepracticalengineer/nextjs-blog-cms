import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { test, expect } from '../fixtures'
import { markEstablishedAccount } from '../established-account'
import { loginEditor } from '../editor-actions'
import { assertDedicatedTestProject } from '../environment'
import { seedPost, removePost } from '../post-fixtures'

// Full-stack coverage uses only the dedicated project accepted by global setup.
// Service access is confined to fixture setup, verification, and teardown.
test('owner library upload, metadata, editor reuse, archive and administrator isolation', async ({ page, browser, request }) => {
  test.setTimeout(120_000)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  assertDedicatedTestProject(url, process.env.E2E_SUPABASE_PROJECT_REF)
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { userId: owner } = JSON.parse(readFileSync('.e2e-state.json', 'utf8')) as { userId: string }
  const key = `library-${randomUUID()}`
  const filename = `${key}.png`
  const title = `Library image ${key}`
  const bytes = await sharp({ create: { width: 180, height: 120, channels: 3, background: `#${randomUUID().replaceAll('-', '').slice(0, 6)}` } }).png().toBuffer()
  let assetId: string | undefined, path: string | undefined, postId: string | undefined, foreignId: string | undefined
  const foreignContext = await browser.newContext()
  try {
    await loginEditor(page)
    await page.goto('/dashboard/media')
    await page.getByLabel('Upload images', { exact: true }).setInputFiles({ name: filename, mimeType: 'image/png', buffer: bytes })
    await page.getByRole('button', { name: `Open ${filename}`, exact: true }).click()
    const details = page.getByRole('dialog', { name: 'Image details', exact: true })
    const imageUrl = await details.getByLabel('Public image URL', { exact: true }).inputValue()
    path = decodeURIComponent(new URL(imageUrl).pathname.split('/post-media/')[1])
    const registered = await db.from('post_media').select('id,owner_id,library_retained,retained,upload_status').eq('path', path).single()
    expect(registered.error).toBeNull()
    expect(registered.data).toMatchObject({ owner_id: owner, library_retained: true, retained: false, upload_status: 'ready' })
    assetId = registered.data!.id
    await details.getByLabel('Title', { exact: true }).fill(title)
    await details.getByLabel('Default alt text', { exact: true }).fill('Default library description')
    await details.getByLabel('Caption', { exact: true }).fill('Library-only caption')
    await details.getByRole('button', { name: 'Save metadata', exact: true }).click()
    await expect(details.getByRole('status')).toContainText('Metadata saved')
    await details.getByRole('button', { name: 'Close details' }).click()

    const post = await seedPost({ title: key, slug: key, content: '<p>Preserve this article text.</p>' })
    postId = post.id
    await page.goto(`/dashboard/posts/${post.id}/edit`)
    await page.getByRole('button', { name: 'Insert or edit image' }).click()
    const picker = page.getByRole('dialog', { name: 'Article image', exact: true })
    await picker.getByRole('tab', { name: 'Media Library', exact: true }).click()
    await picker.getByLabel('Search your images').fill(key)
    await picker.getByRole('button', { name: 'Search media' }).click()
    await picker.getByRole('button', { name: `Select ${title}`, exact: true }).click()
    await expect(picker.getByLabel('Image description (alt text)')).toHaveValue('Default library description')
    await picker.getByLabel('Image description (alt text)').fill('Occurrence-specific description')
    await picker.getByRole('button', { name: 'Use image', exact: true }).click()
    await expect(page.locator('.ProseMirror img')).toHaveAttribute('src', imageUrl)
    await expect(page.locator('.ProseMirror img')).toHaveAttribute('alt', 'Occurrence-specific description')
    await expect(page.locator('.ProseMirror img')).toHaveAttribute('width', '180')
    expect((await db.from('post_media').select('alt_text').eq('id', assetId).single()).data?.alt_text).toBe('Default library description')
    expect((await db.from('post_media').select('id').eq('owner_id', owner).eq('original_filename', filename)).data).toHaveLength(1)

    // An unrelated author and then administrator cannot read or mutate owner assets.
    const email = `${key}@example.test`, password = `E2e-${randomUUID()}!Aa9`
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Foreign media fixture' } })
    expect(created.error).toBeNull()
    foreignId = created.data.user!.id
    await markEstablishedAccount(db, foreignId)
    expect((await db.from('profiles').update({ role: 'author' }).eq('id', foreignId)).error).toBeNull()
    const foreignPage = await foreignContext.newPage()
    await foreignPage.goto(new URL('/login', page.url()).href)
    await foreignPage.getByLabel('Email address', { exact: true }).fill(email)
    await foreignPage.getByLabel('Password', { exact: true }).fill(password)
    await foreignPage.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(foreignPage).toHaveURL(/\/dashboard$/)
    const origin = new URL(page.url()).origin
    for (const role of ['author', 'admin']) {
      expect((await db.from('profiles').update({ role }).eq('id', foreignId)).error).toBeNull()
      const endpoint = `${origin}/api/post-media/library/${assetId}`
      expect((await foreignPage.request.get(`${endpoint}?editorId=${foreignId}`)).status()).toBe(404)
      expect((await foreignPage.request.patch(endpoint, { headers: { origin }, data: { editorId: foreignId, title: 'Forbidden' } })).status()).toBe(404)
      expect((await foreignPage.request.post(`${endpoint}/select`, { headers: { origin }, data: { editorId: foreignId } })).status()).toBe(404)
      const listed = await foreignPage.request.get(`${origin}/api/post-media/library?editorId=${foreignId}&q=${key}`)
      expect(listed.status()).toBe(200)
      expect((await listed.json()).assets).toEqual([])
      expect((await foreignPage.request.get(`${origin}/api/post-media/library?editorId=${owner}`)).status()).toBe(403)
    }

    await page.goto('/dashboard/media')
    await page.getByRole('button', { name: `Open ${title}`, exact: true }).click()
    await details.getByRole('button', { name: 'Archive image', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm archive', exact: true }).click()
    await expect(details.getByRole('status')).toContainText('Image archived')
    await details.getByRole('button', { name: 'Close details' }).click()
    await expect(page.getByRole('button', { name: `Open ${title}`, exact: true })).toHaveCount(0)
    expect((await request.get(imageUrl)).status()).toBe(200)
    expect((await page.request.post(`/api/post-media/library/${assetId}/select`, { headers: { origin }, data: { editorId: owner } })).status()).toBe(404)
    await page.getByLabel('Show', { exact: true }).selectOption('archived')
    await page.getByRole('button', { name: `Open ${title}`, exact: true }).click()
    await details.getByRole('button', { name: 'Restore image' }).click()
    await expect(details.getByRole('status')).toContainText('Image restored')
    expect((await request.get(imageUrl)).status()).toBe(200)
  } finally {
    await foreignContext.close()
    if (postId) await removePost(postId)
    // A failed UI step can occur before asset readback; locate only this unique fixture.
    const owned = await db.from('post_media').select('path').eq('owner_id', owner).eq('original_filename', filename)
    const paths = [...new Set([...(path ? [path] : []), ...(owned.data ?? []).map(row => row.path)])]
    if (paths.length) { await db.storage.from('post-media').remove(paths); await db.from('post_media').delete().in('path', paths) }
    if (foreignId) await db.auth.admin.deleteUser(foreignId)
  }
})
