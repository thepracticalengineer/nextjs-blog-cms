import { test, expect, type Page } from '@playwright/test'

async function openDrawer(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: 'Open menu', exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.route('**/dashboard**', async route => {
    if (!route.request().isNavigationRequest()) return route.continue()
    const response = await route.fetch({ url: 'http://127.0.0.1:3137/e2e/posts-navigation/fixture.html' })
    await route.fulfill({ response })
  })
})

for (const role of ['admin', 'author']) {
  test(`${role}: direct entry, keyboard, route changes and refresh`, async ({ page, isMobile }, testInfo) => {
    await page.goto(`/dashboard/posts?role=${role}`)
    await openDrawer(page, isMobile)
    const toggle = page.getByRole('button', { name: 'Posts', exact: true })
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('link', { name: 'All Posts', exact: true })).toHaveAttribute('aria-current', 'page')
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`${role}-posts-navigation.png`) })
    await expect(page.getByRole('link', { name: 'Categories', exact: true })).toHaveCount(role === 'admin' ? 1 : 0)
    await expect(page.getByRole('link', { name: 'Tags', exact: true })).toHaveCount(role === 'admin' ? 1 : 0)
    await toggle.focus()
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('link', { name: 'All Posts', exact: true })).toBeHidden()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Media', exact: true })).toBeFocused()
    await toggle.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'All Posts', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/dashboard\/posts\/new\?role=/)
    await openDrawer(page, isMobile)
    await expect(page.getByRole('link', { name: 'Add Post', exact: true })).toHaveAttribute('aria-current', 'page')
    await page.reload()
    await openDrawer(page, isMobile)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('link', { name: 'Add Post', exact: true })).toHaveAttribute('aria-current', 'page')
  })
}

for (const [path, label] of [['/dashboard/admin/categories', 'Categories'], ['/dashboard/admin/tags', 'Tags'], ['/dashboard/posts/123/edit', 'All Posts']]) {
  test(`admin direct entry ${label} at ${path}`, async ({ page, isMobile }) => {
    await page.goto(path)
    await openDrawer(page, isMobile)
    await expect(page.getByRole('button', { name: 'Posts', exact: true })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('a[aria-current="page"]')).toHaveCount(1)
  })
}
