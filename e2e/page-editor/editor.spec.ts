import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => { await page.goto('/e2e/page-editor/fixture.html') })

test('edits legacy paragraphs, saves JSON and reloads losslessly', async ({ page }) => {
  const canvas = page.locator('[contenteditable="true"]')
  await expect(canvas).toContainText('First')
  await canvas.locator('p').first().click()
  await page.keyboard.press('Home')
  await page.keyboard.type('Edited ')
  await page.getByRole('button', { name: 'Save fixture', exact: true }).click()
  const saved = JSON.parse(await page.getByLabel('Saved document').textContent() ?? '{}')
  expect(saved.version).toBe(2)
  expect(saved.content.content[0].content[0].text).toBe('Edited First')
  await page.getByRole('button', { name: 'Reload saved', exact: true }).click()
  await expect(canvas).toContainText('Edited First')
  await expect(page.getByRole('region', { name: 'Published fixture' })).toContainText('Edited First')
})

test('inserts blocks and supports undo and redo', async ({ page }) => {
  const canvas = page.locator('[contenteditable="true"]')
  await page.getByRole('button', { name: 'Add Section', exact: true }).click()
  await expect(canvas.locator('[data-page-block="section"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(canvas.locator('[data-page-block="section"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(canvas.locator('[data-page-block="section"]')).toHaveCount(1)
})

test('keyboard outline movement preserves focus and order', async ({ page }) => {
  const first = page.getByRole('button', { name: 'Select Paragraph 1', exact: true })
  await first.click()
  await first.press('Alt+ArrowDown')
  const canvas = page.locator('[contenteditable="true"]')
  await expect(canvas.locator('p').first()).toHaveText('Second')
  await expect(page.getByRole('button', { name: 'Select Paragraph 2', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(canvas.locator('p').first()).toHaveText('First')
})

for (const width of [320, 390, 1000]) {
  test(`shares layout hooks, wraps long text and stacks columns at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.getByRole('button', { name: 'Load layout fixture', exact: true }).click()
    const canvas = page.locator('[contenteditable="true"]')
    await expect(canvas.locator('[data-preset="wide-left"]')).toHaveCount(1)
    await page.getByRole('button', { name: 'Save fixture', exact: true }).click()
    const published = page.getByRole('region', { name: 'Published fixture' })
    await expect(published.locator('[data-preset="wide-left"]')).toHaveCount(1)
    for (const root of [canvas, published]) {
      const boxes = await root.locator('[data-page-block="column"]').evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width } }))
      if (width <= 640) { expect(boxes[0].x).toBe(boxes[1].x); expect(boxes[1].y).toBeGreaterThan(boxes[0].y) }
      else { expect(boxes[1].x).toBeGreaterThan(boxes[0].x); expect(boxes[0].width).toBeGreaterThan(boxes[1].width) }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('page media requests retain asset identity and dimensions through persistence', async ({ page }) => {
  const asset = { id: 'e1633d23-dc07-44c2-b814-1635afbfbb12', url: '/images/fixture.svg', title: 'Page diagram', original_filename: 'diagram.png', alt_text: 'A useful diagram', caption: '', description: '', width: 800, height: 600, byte_size: 10240, uploaded_at: null, archived_at: null }
  await page.route('**/images/fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="gray"/></svg>' }))
  await page.route('**/api/post-media/library**', route => {
    const request = route.request()
    if (request.method() === 'POST') {
      expect(request.postDataJSON()).toMatchObject({ editorId: 'page-fixture' })
      expect(new URL(request.url()).searchParams.get('context')).toBe('page')
      return route.fulfill({ json: { asset } })
    }
    expect(new URL(request.url()).searchParams.get('context')).toBe('page')
    return route.fulfill({ json: { assets: [asset], total: 1, page: 1, pageSize: 24 } })
  })
  await page.route('**/api/post-media?context=page', route => {
    expect(route.request().postDataJSON()).toMatchObject({ editorId: 'page-fixture' })
    return route.fulfill({ json: { src: route.request().postDataJSON().url } })
  })
  await page.getByRole('button', { name: 'Add Image', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Page image', exact: true })
  await dialog.getByRole('tab', { name: 'Media Library' }).click()
  await dialog.getByRole('button', { name: 'Select Page diagram', exact: true }).click()
  await dialog.getByRole('button', { name: 'Use image', exact: true }).click()
  const image = page.locator('[contenteditable="true"] img')
  await expect(image).toHaveAttribute('width', '800')
  await page.getByRole('button', { name: 'Save fixture', exact: true }).click()
  expect(await page.getByLabel('Saved document').textContent()).toContain(asset.id)
  await page.getByRole('button', { name: 'Reload saved', exact: true }).click()
  await expect(image).toHaveAttribute('height', '600')
  await expect(page.getByRole('region', { name: 'Published fixture' }).getByAltText(asset.alt_text)).toHaveAttribute('data-asset-id', asset.id)
  await page.route('**/images/replacement.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="blue"/></svg>' }))
  await page.getByRole('button', { name: /^Select Image / }).click()
  await page.getByRole('button', { name: 'Edit image', exact: true }).click()
  await dialog.getByLabel('Image URL', { exact: true }).fill('/images/replacement.svg')
  await dialog.getByRole('button', { name: 'Use image', exact: true }).click()
  await page.getByRole('button', { name: 'Save fixture', exact: true }).click()
  expect(await page.getByLabel('Saved document').textContent()).not.toContain(asset.id)
  await expect(image).toHaveAttribute('width', '400')
})

test('nested insertion, duplicate and delete preserve columns and preview', async ({ page }) => {
  await page.getByRole('button', { name: 'Load layout fixture', exact: true }).click()
  await page.getByRole('button', { name: 'Select Column 1', exact: true }).click()
  await page.getByRole('button', { name: 'Add Heading', exact: true }).click()
  const canvas = page.locator('[contenteditable="true"]')
  await expect(canvas.locator('[data-page-block="column"]').first().locator('h2')).toHaveCount(1)
  await page.getByRole('button', { name: 'Duplicate block', exact: true }).click()
  await expect(canvas.locator('[data-page-block="column"]').first().locator('h2')).toHaveCount(2)
  await page.getByRole('button', { name: 'Delete block', exact: true }).click()
  await expect(canvas.locator('[data-page-block="column"]').first().locator('h2')).toHaveCount(1)
  await expect(canvas.locator('[data-page-block="column"]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.locator('[data-page-content] h2')).toHaveText('Heading')
  await page.getByRole('button', { name: 'Edit canvas', exact: true }).click()
  await expect(canvas).toBeVisible()
})

test('drags sibling blocks in the outline', async ({ page }) => {
  const first = page.getByRole('button', { name: 'Select Paragraph 1', exact: true })
  const second = page.getByRole('button', { name: 'Select Paragraph 2', exact: true })
  await first.dragTo(second)
  await expect(page.locator('[contenteditable="true"] p').first()).toHaveText('Second')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('[contenteditable="true"] p').first()).toHaveText('First')
})

test('bounded settings preserve column content and reject unsafe button links', async ({ page }) => {
  await page.getByRole('button', { name: 'Load layout fixture', exact: true }).click()
  await page.getByRole('button', { name: 'Select Columns 1', exact: true }).click()
  await page.getByRole('combobox', { name: /^Column preset/ }).selectOption('one')
  const canvas = page.locator('[contenteditable="true"]')
  await expect(canvas.locator('[data-page-block="column"]')).toHaveCount(1)
  await expect(canvas).toContainText('Narrow column')
  await page.getByRole('combobox', { name: 'Background', exact: true }).selectOption('accent')
  await expect(canvas.locator('[data-page-block="columns"]')).toHaveAttribute('data-background', 'accent')
  await page.getByRole('button', { name: 'Add Button', exact: true }).click()
  await page.getByLabel('Label', { exact: true }).fill('Explore')
  await page.getByLabel('Link', { exact: true }).fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Apply button', exact: true }).click()
  await expect(canvas.locator('[data-page-block="button"] a')).toHaveAttribute('href', '/')
  await page.getByLabel('Link', { exact: true }).fill('/explore')
  await page.getByRole('button', { name: 'Apply button', exact: true }).click()
  await expect(canvas.locator('[data-page-block="button"] a')).toHaveAttribute('href', '/explore')
  await page.getByRole('button', { name: 'Save fixture', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Published fixture' }).getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/explore')
})

for (const version of ['legacy', 'rich']) {
  test(`${version} whitespace has identical text and wrapping in editor and renderer`, async ({ page }) => {
    const text = 'First  spaced\nSecond line'
    await page.getByRole('button', { name: `Load ${version} whitespace`, exact: true }).click()
    await page.getByRole('button', { name: 'Save fixture', exact: true }).click()
    const canvas = page.locator('[contenteditable="true"]')
    const published = page.getByRole('region', { name: 'Published fixture' })
    for (const tag of version === 'rich' ? ['p', 'h2'] : ['p']) {
      for (const root of [canvas, published]) {
        const element = root.locator(tag).first()
        expect(await element.textContent()).toBe(text)
        await expect(element).toHaveCSS('white-space', 'pre-wrap')
      }
    }
    await canvas.locator('p').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('!')
    await page.getByRole('button', { name: 'Save fixture', exact: true }).click()
    await page.getByRole('button', { name: 'Reload saved', exact: true }).click()
    expect(await canvas.locator('p').first().textContent()).toBe(await published.locator('p').first().textContent())
    expect((await canvas.locator('p').first().innerText()).replace('!', '')).toBe(text)
    expect(JSON.parse(await page.getByLabel('Saved document').textContent() ?? '{}').version).toBe(2)
  })
}

test('relative rich text links persist through the page link dialog', async ({ page }) => {
  const canvas = page.locator('[contenteditable="true"]')
  await canvas.locator('p').first().click()
  await page.keyboard.press('End')
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Insert link', exact: true })
  await dialog.getByLabel('URL', { exact: true }).fill('/about')
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(canvas.locator('a')).toHaveAttribute('href', '/about')
  await page.getByRole('button', { name: 'Save fixture', exact: true }).click()
  await page.getByRole('button', { name: 'Reload saved', exact: true }).click()
  await expect(canvas.locator('a')).toHaveAttribute('href', '/about')
  await expect(page.getByRole('region', { name: 'Published fixture' }).getByRole('link', { name: '/about' })).toHaveAttribute('href', '/about')
})
