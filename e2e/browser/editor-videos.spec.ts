import { test, expect } from '../fixtures'
import { loginEditor } from '../editor-actions'
import { seedPost, readPost, removePost } from '../post-fixtures'

test('video URLs survive a real draft save, reopen and authenticated preview', async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Player fixture</p>' }))
  await page.route('https://video-test.example/**', route => route.fulfill({ status: 404 }))
  const post = await seedPost({ title: 'Video draft persistence verification', slug: `video-draft-${Date.now()}`, content: '<p>Existing article text</p>' })
  try {
    await loginEditor(page)
    await page.goto(`/dashboard/posts/${post.id}/edit`)
    await expect(page.locator('.tiptap')).toBeVisible()
    for (const url of ['https://youtu.be/aqz-KE-bpKQ', 'https://video-test.example/clip.mp4?token=a&b=c']) {
      await page.locator('.tiptap').press('Control+End')
      await page.getByRole('button', { name: 'Insert or edit video' }).click()
      await page.getByLabel('Video URL', { exact: true }).fill(url)
      await page.getByRole('button', { name: 'Apply', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
    await expect(page.getByText('Post saved as draft', { exact: true })).toBeVisible()
    const saved = await readPost(post.id)
    expect(saved.content).toContain('youtube-nocookie.com/embed/aqz-KE-bpKQ')
    expect(saved.content).toContain('https://video-test.example/clip.mp4?token=a&b=c')
    await page.reload()
    await expect(page.locator('.tiptap iframe')).toHaveCount(1)
    await expect(page.locator('.tiptap video')).toHaveCount(1)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const preview = page.getByRole('dialog', { name: 'Reader preview' })
    await expect(preview.locator('iframe')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ')
    await expect(preview.locator('video')).toHaveAttribute('controls', '')
    await expect(preview.locator('video')).not.toHaveAttribute('autoplay')
  } finally { await removePost(post.id) }
})
