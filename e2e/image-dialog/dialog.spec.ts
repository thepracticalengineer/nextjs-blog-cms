import { test, expect } from '@playwright/test'

const filename = `${'a'.repeat(220)}.png`
const file = { name: filename, mimeType: 'image/png', buffer: Buffer.from('fixture image bytes') }
const imageUrl = '/e2e/image-dialog/image.svg'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="blue"/></svg>'

test.beforeEach(async ({ page }) => {
  await page.route('**/e2e/image-dialog/image.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: svg }))
  await page.goto('/e2e/image-dialog/fixture.html')
  await page.getByRole('button', { name: 'Choose image' }).click()
})

test('long filenames fit desktop, mobile and short viewports with reachable footer', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 400 }]) {
    await page.setViewportSize(viewport)
    await page.getByLabel('Image file', { exact: true }).setInputFiles(file)
    const dialog = page.getByRole('dialog', { name: 'Cover image', exact: true })
    await expect(dialog.getByTitle(filename)).toHaveText(`Selected: ${filename}`)
    const bounds = await dialog.evaluate(element => {
      const box = element.getBoundingClientRect()
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
        overflow: element.scrollWidth - element.clientWidth,
        fieldsFit: [...element.querySelectorAll('input')].every(input => input.getBoundingClientRect().right <= box.right) }
    })
    expect(bounds.overflow).toBeLessThanOrEqual(1)
    expect(bounds.fieldsFit).toBe(true)
    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(bounds.right).toBeLessThanOrEqual(viewport.width)
    expect(bounds.top).toBeGreaterThanOrEqual(0)
    expect(bounds.bottom).toBeLessThanOrEqual(viewport.height)
    await expect(page.getByRole('button', { name: 'Use image' })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport()
    await page.getByLabel('Image description (alt text)').fill('Description')
  }
})

for (const method of ['Close', 'Cancel', 'Escape', 'backdrop']) {
  test(`${method} protects pending input, keep editing and discard restore focus`, async ({ page }) => {
    await page.getByLabel('Image file', { exact: true }).setInputFiles(file)
    await page.getByLabel('Image URL', { exact: true }).fill(imageUrl)
    await page.getByLabel('Image description (alt text)').fill('Pending description')
    if (method === 'Escape') await page.keyboard.press('Escape')
    else if (method === 'backdrop') await page.mouse.click(1, 1)
    else await page.getByRole('button', { name: method, exact: true }).click()
    const confirm = page.getByRole('dialog', { name: 'Discard image changes?' })
    await expect(confirm).toBeVisible()
    await expect(confirm.getByRole('button', { name: 'Keep editing' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(confirm).not.toBeVisible()
    await expect(page.getByLabel('Image URL', { exact: true })).toHaveValue(imageUrl)
    await expect(page.getByLabel('Image description (alt text)')).toHaveValue('Pending description')
    await expect(page.getByTitle(filename)).toBeVisible()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await confirm.getByRole('button', { name: 'Keep editing' }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await confirm.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Choose image' })).toBeFocused()
    await page.getByRole('button', { name: 'Choose image' }).click()
    await expect(page.getByLabel('Image URL', { exact: true })).toHaveValue('')
  })
}

test('unchanged closes easily and keyboard focus remains within dialog', async ({ page }) => {
  await page.keyboard.press('Shift+Tab')
  await expect.poll(() => page.getByRole('dialog').evaluate(el => el.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Choose image' })).toBeFocused()
})

test('URL workflow applies description and restores focus', async ({ page }) => {
  await page.route('**/api/post-media', route => route.fulfill({ json: { src: imageUrl } }))
  await page.getByLabel('Image URL', { exact: true }).fill(imageUrl)
  await page.getByLabel('Image description (alt text)').fill('Blue rectangle')
  await page.getByRole('button', { name: 'Use image' }).click()
  await expect(page.getByLabel('Applied image')).toContainText('Blue rectangle')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('failed upload retains input, retry reports reuse and applies image', async ({ page }) => {
  let calls = 0
  await page.route('**/api/post-media', route => {
    if (route.request().headers()['content-type']?.includes('application/json')) return route.fulfill({ json: { src: imageUrl } })
    calls++
    return calls === 1 ? route.fulfill({ status: 503, json: { error: 'Connection lost. Retry.' } })
      : route.fulfill({ json: { src: imageUrl, width: 80, height: 60, reused: true } })
  })
  await page.getByLabel('Image file', { exact: true }).setInputFiles(file)
  await page.getByRole('button', { name: 'Upload image / retry' }).click()
  await expect(page.getByRole('alert')).toContainText('Connection lost')
  await expect(page.getByTitle(filename)).toBeVisible()
  await page.getByRole('button', { name: 'Upload image / retry' }).click()
  await expect(page.getByRole('status')).toContainText('already been uploaded')
  await page.getByLabel('Image description (alt text)').fill('Reused image')
  await page.getByRole('button', { name: 'Use image' }).click()
  await expect(page.getByLabel('Applied image')).toContainText('Reused image')
  expect(calls).toBe(2)
})

test('upload dismissal requires confirmation and repeated activation sends one request', async ({ page }) => {
  let requests = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/post-media', async route => {
    requests++
    await gate
    await route.fulfill({ json: { src: imageUrl, width: 80, height: 60 } }).catch(() => {})
  })
  try {
    await page.getByLabel('Image file', { exact: true }).setInputFiles(file)
    const upload = page.getByRole('button', { name: 'Upload image / retry' })
    // Two activations in one event turn also exercise the synchronous request guard.
    await upload.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
    await expect.poll(() => requests).toBe(1)
    await expect(upload).toBeDisabled()
    await page.keyboard.press('Escape')
    const confirm = page.getByRole('dialog', { name: 'Discard image changes?' })
    await expect(confirm).toContainText('server may still finish')
    await confirm.getByRole('button', { name: 'Keep editing' }).click()
    await expect(upload).toBeDisabled()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await confirm.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(requests).toBe(1)
  } finally { release() }
})

test('inline images use the same dismissal protection and can apply decorative images', async ({ page }) => {
  await page.goto('/e2e/image-dialog/fixture.html?inline')
  await page.getByRole('button', { name: 'Choose image' }).click()
  await expect(page.getByRole('dialog', { name: 'Article image', exact: true })).toBeVisible()
  await page.route('**/api/post-media', route => route.fulfill({ json: { src: imageUrl } }))
  await page.getByLabel('Image URL', { exact: true }).fill(imageUrl)
  await page.getByLabel('This image is decorative').check()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByLabel('This image is decorative')).toBeChecked()
  await page.getByRole('button', { name: 'Use image' }).click()
  await expect(page.getByLabel('Applied image')).toContainText(imageUrl)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
