import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Isolated player fixture</p>' }))
  await page.goto('/e2e/video-dialog/fixture.html')
})

test('insert, edit, remove, undo/redo, draft reopen and article render', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert or edit video' }).click()
  await page.getByLabel('Video URL', { exact: true }).fill('https://www.youtube.com/watch?v=aqz-KE-bpKQ')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.locator('.tiptap iframe')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  for (const region of ['Published article', 'Article preview']) {
    const player = page.getByRole('region', { name: region, exact: true }).locator('iframe')
    await expect(player).toHaveAttribute('title', 'YouTube video player')
    await expect(player).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ')
    const bounds = await player.boundingBox()
    expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  }
  await page.getByRole('button', { name: 'Select video', exact: true }).click()
  await page.getByRole('button', { name: 'Insert or edit video' }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Edit video')
  await page.getByLabel('Video URL', { exact: true }).fill('https://cdn.example/movie.webm?token=a&b=c')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.locator('.tiptap video')).toHaveAttribute('src', 'https://cdn.example/movie.webm?token=a&b=c')
  await expect(page.locator('.tiptap iframe')).toHaveCount(0)
  await page.getByRole('button', { name: 'Select video', exact: true }).click()
  await page.getByRole('button', { name: 'Insert or edit video' }).click()
  await page.getByRole('button', { name: 'Remove video', exact: true }).click()
  await expect(page.locator('.tiptap video')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.tiptap video')).toHaveCount(1)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.locator('.tiptap video')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await page.reload()
  await expect(page.locator('.tiptap video')).toHaveAttribute('src', 'https://cdn.example/movie.webm?token=a&b=c')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  for (const region of ['Published article', 'Article preview']) {
    const player = page.getByRole('region', { name: region, exact: true }).locator('video')
    await expect(player).toHaveAttribute('controls', '')
    await expect(player).not.toHaveAttribute('autoplay')
    const bounds = await player.boundingBox()
    expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  }
})

test('validation, cancel and keyboard focus at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const before = await page.locator('.tiptap').innerHTML()
  const trigger = page.getByRole('button', { name: 'Insert or edit video' })
  await trigger.focus(); await trigger.press('Enter')
  await expect(page.getByLabel('Video URL', { exact: true })).toBeFocused()
  for (const url of ['javascript:alert(1)', 'https://vimeo.com/123', 'http://cdn.example/clip.mp4', 'https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ']) {
    await page.getByLabel('Video URL', { exact: true }).fill(url)
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Enter a YouTube')
    expect(await page.locator('.tiptap').innerHTML()).toBe(before)
  }
  const bounds = await page.getByRole('dialog').boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  expect(await page.locator('.tiptap').innerHTML()).toBe(before)
})

test('refuses to modify a stale document', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert or edit video' }).click()
  await page.getByLabel('Video URL', { exact: true }).fill('https://youtu.be/aqz-KE-bpKQ')
  await page.evaluate(() => window.dispatchEvent(new Event('replace-content')))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The document changed')
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await expect(page.locator('.tiptap')).toHaveText('Externally changed writing')
  await expect(page.locator('.tiptap iframe')).toHaveCount(0)
})
