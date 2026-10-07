import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { test, expect } from '../fixtures'
import { readyArticle } from '../publication-fixture'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Email address', { exact: true }).fill(process.env.E2E_TEST_EMAIL ?? 'e2e-test@playwright.local')
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_TEST_PASSWORD ?? 'E2eTestPassword123!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test('cover picker and inline paste upload owned images with descriptions, preview and public parity', async ({ page, request, apiKey }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const db = admin()
  const bytes = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#2468ad' } }).png().toBuffer()
  const headers = { Authorization: `Bearer ${apiKey}` }
  const slug = `post-media-${Date.now()}`
  const paths: string[] = []
  let id: string | undefined
  try {
    await login(page)
    await page.goto('/dashboard/posts/new')
    await expect(page.locator('.ProseMirror')).toBeVisible()
    id = new URL(page.url()).searchParams.get('draft')!
    await page.getByLabel('Post title').fill(readyArticle.title)
    await page.getByLabel('Post title').blur()
    await expect(page.getByLabel('Slug', { exact: true })).toHaveValue('integration-testing-at-service-boundaries')
    await page.getByLabel('Slug', { exact: true }).fill(slug)
    await page.getByLabel('Excerpt', { exact: true }).fill(readyArticle.excerpt)
    await page.locator('.ProseMirror').fill(readyArticle.content.replace(/<[^>]+>/g, ' '))
    await page.getByText('Settings', { exact: true }).click()
    await page.getByRole('button', { name: 'Choose cover image' }).click()
    const coverDialog = page.getByRole('dialog', { name: 'Cover image', exact: true })
    await coverDialog.getByLabel('Image file', { exact: true }).setInputFiles({ name: 'circuit.png', mimeType: 'image/png', buffer: bytes })
    await coverDialog.getByRole('button', { name: 'Upload image / retry' }).click()
    await expect(coverDialog.getByText(/Image ready/)).toBeVisible()
    await coverDialog.getByLabel('Image description (alt text)').fill('A blue circuit board viewed from above')
    await coverDialog.getByRole('button', { name: 'Use image' }).click()
    await expect(coverDialog).not.toBeVisible()
    const coverUrl = await page.getByLabel('Cover image', { exact: true }).inputValue()
    const path = decodeURIComponent(new URL(coverUrl).pathname.split('/post-media/')[1])
    paths.push(path)
    await expect(page.getByAltText('A blue circuit board viewed from above')).toBeVisible()
    // Unauthenticated storage writes and authenticated direct writes both fail.
    const untrusted = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    expect((await untrusted.storage.from('post-media').upload(`other/${randomUUID()}.webp`, bytes, { contentType: 'image/webp' })).error).toBeTruthy()
    const signedIn = await untrusted.auth.signInWithPassword({ email: process.env.E2E_TEST_EMAIL ?? 'e2e-test@playwright.local', password: process.env.E2E_TEST_PASSWORD ?? 'E2eTestPassword123!' })
    expect(signedIn.error).toBeNull()
    const ownPath = `${signedIn.data.user!.id}/${randomUUID()}.webp`
    expect((await untrusted.storage.from('post-media').upload(ownPath, bytes, { contentType: 'image/webp' })).error).toBeTruthy()
    expect((await untrusted.storage.from('post-media').update(path, bytes, { contentType: 'image/webp' })).error).toBeTruthy()
    await untrusted.storage.from('post-media').remove([path])
    expect((await request.get(coverUrl)).status()).toBe(200)
    // Image-file paste uses the same dialog and endpoint, without losing article text.
    await page.locator('.ProseMirror').focus()
    await page.locator('.ProseMirror').evaluate((element, base64) => {
      const binary = atob(base64)
      const data = Uint8Array.from(binary, c => c.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([data], 'pasted-board.png', { type: 'image/png' }))
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
    }, bytes.toString('base64'))
    const inlineDialog = page.getByRole('dialog', { name: 'Article image' })
    await expect(inlineDialog.getByText('Selected: pasted-board.png')).toBeVisible()
    // A failed upload preserves the document and selected file for retry.
    let failed = false
    await page.route('**/api/post-media', async route => {
      if (!failed && route.request().headers()['content-type']?.startsWith('multipart/form-data')) {
        failed = true
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary storage failure. Retry.' }) })
      } else await route.continue()
    })
    await inlineDialog.getByRole('button', { name: 'Upload image / retry' }).click()
    await expect(inlineDialog.getByRole('alert')).toContainText('Temporary storage failure')
    await expect(page.locator('.ProseMirror')).toContainText('A reliable integration test')
    await inlineDialog.getByRole('button', { name: 'Upload image / retry' }).click()
    await expect(inlineDialog.getByText(/Image ready/)).toBeVisible()
    const inlineUrl = await inlineDialog.getByLabel('Image URL', { exact: true }).inputValue()
    paths.push(decodeURIComponent(new URL(inlineUrl).pathname.split('/post-media/')[1]))
    await inlineDialog.getByLabel('Image description (alt text)').fill('Initial board description')
    await inlineDialog.getByRole('button', { name: 'Use image' }).click()
    await expect(inlineDialog).not.toBeVisible()
    await page.locator('.ProseMirror img').click()
    await page.getByRole('button', { name: 'Insert or edit image' }).click()
    await expect(inlineDialog.getByLabel('Image description (alt text)')).toHaveValue('Initial board description')
    await inlineDialog.getByLabel('Image description (alt text)').fill('Test points on a blue board')
    await inlineDialog.getByRole('button', { name: 'Use image' }).click()
    await expect(inlineDialog).not.toBeVisible()
    await expect(page.locator('.ProseMirror img')).toHaveCount(1)
    await expect(page.locator('.ProseMirror img')).toHaveAttribute('alt', 'Test points on a blue board')
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const preview = page.getByRole('dialog', { name: 'Reader preview' })
    const inline = preview.getByAltText('Test points on a blue board')
    await expect(inline).toHaveAttribute('width', '640')
    await expect(inline).toHaveAttribute('height', '480')
    await expect(inline).toHaveAttribute('loading', 'lazy')
    await inline.scrollIntoViewIfNeeded()
    await expect.poll(() => inline.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(640)
    const cover = preview.getByAltText('A blue circuit board viewed from above')
    await expect.poll(() => cover.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await page.getByRole('checkbox', { name: /I have reviewed/ }).check()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm publication', exact: true }).click()
    await expect(page.getByRole('button', { name: 'View Post', exact: true })).toBeVisible()
    const saved = await request.get(`/api/posts/${id}`, { headers }).then(r => r.json())
    expect(saved.data.slug).toBe(slug)
    expect(saved.data.status).toBe('published')
    expect(saved.data.image_alt).toBe('A blue circuit board viewed from above')
    expect(saved.data.content).toContain('Test points on a blue board')
    const registered = await db.from('post_media').select('path, retained, owner_id').in('path', paths)
    expect(registered.error).toBeNull()
    expect(registered.data).toHaveLength(2)
    expect(registered.data?.every(image => image.retained && image.path.startsWith(`${image.owner_id}/`))).toBe(true)
    // Exercise the operations command against actual stored objects.
    const abandoned = `${signedIn.data.user!.id}/${randomUUID()}.webp`
    paths.push(abandoned)
    const abandonedUrl = db.storage.from('post-media').getPublicUrl(abandoned).data.publicUrl
    expect((await db.from('post_media').insert({ path: abandoned, owner_id: signedIn.data.user!.id, url: abandonedUrl })).error).toBeNull()
    expect((await db.storage.from('post-media').upload(abandoned, await sharp(bytes).webp().toBuffer(), { contentType: 'image/webp' })).error).toBeNull()
    expect((await db.from('post_media').update({ created_at: new Date(Date.now() - 8 * 86400_000).toISOString() }).in('path', paths)).error).toBeNull()
    const dryRun = JSON.parse(execFileSync(process.execPath, ['scripts/cleanup-post-media.mjs'], { encoding: 'utf8' }))
    expect(dryRun.candidates.map((media: { path: string }) => media.path)).toContain(abandoned)
    expect(dryRun.candidates.some((media: { path: string }) => media.path === path)).toBe(false)
    execFileSync(process.execPath, ['scripts/cleanup-post-media.mjs', '--apply'], { encoding: 'utf8' })
    expect((await db.from('post_media').select('state').eq('path', abandoned).single()).data?.state).toBe('deleted')
    expect((await request.get(abandonedUrl)).status()).not.toBe(200)
    expect((await request.get(coverUrl)).status()).toBe(200)
    expect((await request.get(inlineUrl)).status()).toBe(200)
    await page.goto(`/blog/${slug}`)
    const publicInline = page.getByAltText('Test points on a blue board')
    await expect(publicInline).toHaveAttribute('width', '640')
    await publicInline.scrollIntoViewIfNeeded()
    await expect.poll(() => publicInline.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(640)
    const publicCover = page.getByAltText('A blue circuit board viewed from above')
    await expect.poll(() => publicCover.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  } finally {
    if (id) await request.delete(`/api/posts/${id}`, { headers })
    if (paths.length) {
      await db.storage.from('post-media').remove(paths)
      await db.from('post_media').delete().in('path', paths)
    }
  }
})
