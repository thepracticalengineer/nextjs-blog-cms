import { test, expect } from '@playwright/test'

const imageUrl = '/e2e/media-library/image.svg'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#ddd"/><path d="M100 300h600M400 100v400" stroke="#526" stroke-width="20"/></svg>'
const initial = { id: 'e1633d23-dc07-44c2-b814-1635afbfbb12', url: imageUrl, title: 'Circuit board', original_filename: 'circuit.png', alt_text: 'A circuit board on a workbench', caption: '', description: '', width: 800, height: 600, byte_size: 10240, uploaded_at: null, archived_at: null as string | null }

test.beforeEach(async ({ page }) => {
  let asset = { ...initial }
  await page.route('**/e2e/media-library/image.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: svg }))
  await page.route('**/api/post-media/library**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'PATCH') { const { editorId, archived, ...metadata } = request.postDataJSON(); expect(editorId).toBe('test-owner'); asset = { ...asset, ...metadata, ...(archived !== undefined ? { archived_at: archived ? new Date().toISOString() : null } : {}) }; return route.fulfill({ json: { asset } }) }
    if (request.method() === 'POST') { expect(request.postDataJSON().editorId).toBe('test-owner'); return route.fulfill({ json: { asset } }) }
    expect(url.searchParams.get('editorId')).toBe('test-owner')
    if (url.pathname.endsWith(initial.id)) return route.fulfill({ json: { asset } })
    const matches = (!url.searchParams.get('q') || asset.title.includes(url.searchParams.get('q')!)) && (url.searchParams.get('filter') === 'archived' ? !!asset.archived_at : !asset.archived_at)
    return route.fulfill({ json: { assets: matches ? [asset] : [], total: matches ? 1 : 0, page: 1, pageSize: 24 } })
  })
  await page.goto('/e2e/media-library/fixture.html')
})

test('browse, search, edit defaults, archive and restore with keyboard focus', async ({ page }) => {
  await page.getByRole('button', { name: 'List view' }).click()
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Search your images').fill('missing')
  await page.getByRole('button', { name: 'Search media' }).click()
  await expect(page.getByText('No matching images')).toBeVisible()
  await page.getByLabel('Search your images').fill('')
  await page.getByRole('button', { name: 'Search media' }).click()
  const opener = page.getByRole('button', { name: 'Open Circuit board' })
  await opener.focus(); await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Image details' })
  await expect(dialog).toBeVisible()
  await page.getByLabel('Default alt text').fill('New default description')
  await page.getByRole('button', { name: 'Save metadata' }).click()
  await expect(page.getByText('Metadata saved. Existing articles are unchanged.')).toBeVisible()
  await page.getByRole('button', { name: 'Archive image', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm archive' }).click()
  await expect(page.getByText('Image archived. Existing URLs still work.')).toBeVisible()
  await page.getByRole('button', { name: 'Close details' }).click()
  await expect(opener).toHaveCount(0)
  await page.getByLabel('Show', { exact: true }).selectOption('archived')
  await opener.click()
  await page.getByRole('button', { name: 'Restore image' }).click()
  await expect(page.getByText('Image restored to your library.')).toBeVisible()
})

test('picker copies default alt and allows per-occurrence override', async ({ page }) => {
  await page.getByRole('button', { name: 'Choose cover' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cover image', exact: true })
  await dialog.getByRole('tab', { name: 'Media Library' }).click()
  await dialog.getByRole('button', { name: 'Select Circuit board' }).click()
  await expect(dialog.getByLabel('Image description (alt text)')).toHaveValue(initial.alt_text)
  await dialog.getByLabel('Image description (alt text)').fill('Specific article description')
  await page.route('**/api/post-media', route => route.fulfill({ json: { src: imageUrl } }))
  await dialog.getByRole('button', { name: 'Use image' }).click()
  await expect(page.getByLabel('Applied image')).toHaveText(`${imageUrl}: Specific article description`)
})

test('multiple uploads retain failed files and retry with durable library intent', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/post-media', route => {
    expect(route.request().postData()).toContain('library')
    attempts++
    return route.fulfill(attempts === 1 ? { status: 503, json: { error: 'Storage temporarily unavailable' } } : { json: { src: imageUrl, width: 800, height: 600 } })
  })
  await page.getByLabel('Upload images', { exact: true }).setInputFiles([{ name: 'one.png', mimeType: 'image/png', buffer: Buffer.from('first') }, { name: 'two.png', mimeType: 'image/png', buffer: Buffer.from('second') }])
  await expect(page.getByText('Storage temporarily unavailable')).toBeVisible()
  await expect(page.getByText('Uploaded', { exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Retry one.png' }).click()
  await expect(page.getByText('Uploaded', { exact: true })).toHaveCount(2)
})

test('small screens keep library and details within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.getByRole('button', { name: 'Open Circuit board' }).click()
  const dialog = page.getByRole('dialog', { name: 'Image details' })
  const box = await dialog.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(568)
  await expect(page.getByRole('button', { name: 'Close details' })).toBeInViewport()
  expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/media-library/mobile-details.png' })
})

test('pending picker selection disables newer URL and description edits', async ({ page }) => {
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  await page.route('**/api/post-media/library/*/select', async route => { await pending; await route.fulfill({ json: { asset: initial } }) })
  await page.getByRole('button', { name: 'Choose cover' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cover image', exact: true })
  await dialog.getByRole('tab', { name: 'Media Library' }).click()
  await dialog.getByRole('button', { name: 'Select Circuit board' }).click()
  await expect(dialog.getByLabel('Image URL', { exact: true })).toBeDisabled()
  await expect(dialog.getByLabel('Image description (alt text)')).toBeDisabled()
  finish()
  await expect(dialog.getByLabel('Image description (alt text)')).toHaveValue(initial.alt_text)
  await expect(dialog.getByLabel('Image description (alt text)')).toBeEnabled()
})
