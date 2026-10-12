import { expect, test, type Page } from '@playwright/test'

type Command = [string, string, Record<string, unknown>?]
const commands = (page: Page): Promise<Command[]> => page.evaluate(() =>
  ((window as unknown as { dataLayer?: IArguments[] }).dataLayer ?? []).map(item => Array.from(item)) as Command[],
)
const events = async (page: Page) => (await commands(page)).filter(item => item[0] === 'event')

test.beforeEach(async ({ context }) => {
  // Fulfill the vendor loader in memory. Block every other external request.
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1') return route.continue()
    if (url.hostname === 'www.googletagmanager.com') return route.fulfill({ contentType: 'text/javascript', body: '/* isolated analytics loader fixture */' })
    return route.abort()
  })
})

test('consent, private transitions, history, sanitized outbound links and withdrawal', async ({ page }) => {
  await page.goto('/e2e/analytics/fixture.html')
  await expect(page.locator('#current')).toHaveText('/blog/article')
  expect(await commands(page)).toEqual([])
  await page.getByRole('button', { name: 'New subscription' }).click()
  expect(await commands(page)).toEqual([])
  await page.getByRole('button', { name: 'Allow analytics' }).click()
  await expect.poll(async () => (await events(page)).length).toBe(1)
  await page.getByRole('button', { name: 'Second article' }).click()
  await expect.poll(async () => (await events(page)).length).toBe(2)
  await page.getByRole('button', { name: 'Dashboard' }).click()
  await expect(page.locator('#current')).toHaveText('/dashboard')
  await page.getByRole('button', { name: 'New subscription' }).click()
  expect((await events(page)).length).toBe(2)
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['ga-disable-G-TEST123'])).toBe(true)
  await page.goBack()
  await expect(page.locator('#current')).toHaveText('/blog/second')
  await expect.poll(async () => (await events(page)).length).toBe(3)
  await page.goForward()
  await expect(page.locator('#current')).toHaveText('/dashboard')
  expect((await events(page)).length).toBe(3)
  await page.getByRole('button', { name: 'First article' }).click()
  await expect.poll(async () => (await events(page)).length).toBe(4)
  await page.getByRole('link', { name: 'Repository' }).click()
  await page.getByRole('button', { name: 'New subscription' }).click()
  expect((await events(page)).map(item => item[1])).toEqual(['page_view', 'page_view', 'page_view', 'page_view', 'click', 'newsletter_subscribe'])
  await page.getByRole('button', { name: 'Turn off analytics' }).click()
  await page.getByRole('button', { name: 'Second article' }).click()
  await page.getByRole('button', { name: 'New subscription' }).click()
  expect((await events(page)).length).toBe(6)
  expect(JSON.stringify(await commands(page))).not.toMatch(/private-secret|link-secret|\/dashboard/)
})

test('does not send search terms or collect token-bearing URLs', async ({ page }) => {
  await page.goto('/e2e/analytics/fixture.html')
  await page.getByRole('button', { name: 'Allow analytics' }).click()
  await expect.poll(async () => (await events(page)).length).toBe(1)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect.poll(async () => (await events(page)).length).toBe(2)
  expect((await events(page))[1][2]?.page_location).toBe('http://127.0.0.1:3106/blog')
  await page.getByRole('button', { name: 'Token URL' }).click()
  await page.getByRole('button', { name: 'New subscription' }).click()
  expect((await events(page)).length).toBe(2)
  expect(JSON.stringify(await commands(page))).not.toMatch(/reader|example\.com|private-secret/)
})

test('a blocked analytics loader leaves reading and navigation usable', async ({ page }) => {
  await page.route('**/gtag/js?*', route => route.abort())
  await page.goto('/e2e/analytics/fixture.html')
  await page.getByRole('button', { name: 'Allow analytics' }).click()
  await page.getByRole('button', { name: 'Second article' }).click()
  await expect(page.locator('#current')).toHaveText('/blog/second')
  await page.getByRole('button', { name: 'New subscription' }).click()
  expect(await events(page)).toEqual([])
})
