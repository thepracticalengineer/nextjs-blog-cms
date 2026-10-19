import { expect, test } from '@playwright/test'

for (const width of [320, 390, 1024, 1280]) {
  test(`article author cards and keyboard navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/blog/queue-guide-9')
    const sidebar = page.getByRole('complementary', { name: 'About the author' })
    await expect(sidebar).toBeVisible()
    const cards = sidebar.locator('[data-slot="card"]')
    await expect(cards).toHaveCount(2)
    await expect(cards.first().getByRole('heading')).toHaveAccessibleName('Jane Doe')
    await expect(cards.nth(1).getByRole('heading')).toHaveText('More from Jane Doe')
    await expect(sidebar.getByText('Engineering guides.')).toBeVisible()
    await expect(sidebar.getByText('JD', { exact: true })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: /Website/ })).toHaveAttribute('href', 'https://example.com/')
    await expect(sidebar.getByRole('link', { name: /GitHub/ })).toHaveCount(0)
    const titles = cards.nth(1).getByRole('link')
    // Post 1 is newest; tied dates put 9 before 8. Exclude 9 before limiting.
    await expect(titles).toHaveText(['Queue guide 1', 'Queue guide 8'])
    await expect(titles.first()).toHaveAttribute('href', '/blog/queue-guide-1')
    const articleBox = (await page.locator('article').boundingBox())!
    const sidebarBox = (await sidebar.boundingBox())!
    if (width >= 1024) {
      expect(sidebarBox.x).toBeGreaterThanOrEqual(articleBox.x + articleBox.width)
      expect(Math.abs(sidebarBox.y - articleBox.y)).toBeLessThan(2)
      expect(articleBox.width).toBeGreaterThan(600)
    } else expect(sidebarBox.y).toBeGreaterThanOrEqual(articleBox.y + articleBox.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const profile = sidebar.getByRole('link', { name: 'Jane Doe', exact: true })
    await profile.focus()
    await expect(profile).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(sidebar.getByRole('link', { name: /Website/ })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(titles.first()).toBeFocused()
    await page.screenshot({ path: test.info().outputPath(`author-sidebar-${width}.png`), fullPage: true })
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/blog\/queue-guide-1$/)
  })
}

test('zero and one other posts and empty profile fields render cleanly', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto('/blog/solo')
  const sidebar = page.getByRole('complementary', { name: 'About the author' })
  await expect(sidebar.locator('[data-slot="card"]')).toHaveCount(1)
  await expect(sidebar.getByRole('link', { name: 'Author', exact: true })).toHaveAttribute('href', '/authors/6af2b64d-c7c0-465f-901f-75cf70737172')
  await expect(sidebar.getByRole('list')).toHaveCount(0)
  await page.goto('/blog/pair-current')
  await expect(sidebar.locator('[data-slot="card"]')).toHaveCount(2)
  await expect(sidebar.locator('[data-slot="card"]').nth(1).getByRole('link')).toHaveText(['Pair other'])
})

for (const width of [320, 1280]) {
  test(`loaded avatar and long public fields fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/blog/long-current')
    const sidebar = page.getByRole('complementary', { name: 'About the author' })
    const profile = sidebar.getByRole('link', { name: 'A'.repeat(120), exact: true })
    const image = profile.locator('img')
    await expect(image).toHaveAttribute('alt', '')
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
    await expect(sidebar.getByRole('link', { name: 'C'.repeat(150), exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const card of await sidebar.locator('[data-slot="card"]').all()) {
      expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    }
    await profile.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/authors\/8af2b64d-c7c0-465f-901f-75cf70737172$/)
    await expect(page.getByRole('heading', { level: 1, name: 'A'.repeat(120), exact: true })).toBeVisible()
  })
}
