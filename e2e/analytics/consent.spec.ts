import { expect, test } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
})

test('prompt is visible immediately, reserves space, and moves preferences to footer', async ({ page }) => {
  await page.goto('/e2e/analytics/consent.html')
  const banner = page.getByRole('region', { name: 'Analytics preferences' })
  await expect(banner).toBeInViewport()
  await expect(page.getByRole('button', { name: 'No thanks' })).toBeInViewport()
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await expect.poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).paddingBottom))).toBeGreaterThan(0)
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
  const submit = await page.getByRole('button', { name: 'Subscribe', exact: true }).boundingBox()
  const prompt = await banner.boundingBox()
  expect(submit!.y + submit!.height).toBeLessThanOrEqual(prompt!.y)
  await page.getByRole('button', { name: 'No thanks' }).click()
  await expect(banner).toHaveCount(0)
  await expect(page.locator('body')).toHaveCSS('padding-bottom', '0px')
  await page.getByText('Analytics preferences', { exact: true }).click()
  await page.getByRole('button', { name: 'Allow analytics' }).click()
  await page.getByRole('button', { name: 'Turn off analytics' }).click()
  await expect(page.getByText('Optional Google Analytics is off.')).toBeVisible()
})

test('does not invite consent on a noncanonical host', async ({ page }) => {
  await page.goto('/e2e/analytics/consent.html?mismatch')
  await expect(page.getByRole('heading', { name: 'Public article' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Analytics preferences' })).toHaveCount(0)
  await expect(page.getByText('Analytics preferences', { exact: true })).toHaveCount(0)
})
