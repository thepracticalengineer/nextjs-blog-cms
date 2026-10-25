import { test, expect } from '@playwright/test'

const fixture = 'http://127.0.0.1:54996'
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort()
  })
})
test('shared cooldown blocks Auth, preserves fields and permits retry on expiry', async ({ page, request }) => {
  await request.get(`${fixture}/__control?mode=cooldown`)
  await page.goto('/login')
  await page.getByLabel('Email address').fill('test@example.com')
  await page.getByLabel('Password', { exact: true }).fill('LegacyPassword')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('[data-slot="alert"]')).toContainText('Please wait')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('LegacyPassword')
  const state = await (await request.get(`${fixture}/__state`)).json()
  expect(state.calls).toBe(0)
  expect(state.reservations).toHaveLength(1)
  expect(state.reservations[0].p_account_key).toMatch(/^[a-f0-9]{64}$/)
  expect(JSON.stringify(state.reservations)).not.toMatch(/test@example|LegacyPassword/)
  await request.get(`${fixture}/__control?mode=normal`)
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled({ timeout: 5000 })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('[data-slot="alert"]')).toContainText('Unable to sign in')
  expect((await (await request.get(`${fixture}/__state`)).json()).calls).toBe(1)
})
test('provider 429 produces a neutral cooldown and database outage never calls Auth', async ({ page, request }) => {
  for (const mode of ['provider429', 'outage']) {
    await request.get(`${fixture}/__control?mode=${mode}`)
    await page.goto('/login')
    await page.getByLabel('Email address').fill('test@example.com')
    await page.getByLabel('Password', { exact: true }).fill('LegacyPassword')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.locator('[data-slot="alert"]')).toContainText(mode === 'provider429' ? 'Too many attempts' : 'temporarily unavailable')
    await expect(page.locator('[data-slot="alert"]')).not.toContainText('PRIVATE')
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled()
    expect((await (await request.get(`${fixture}/__state`)).json()).calls).toBe(mode === 'provider429' ? 1 : 0)
  }
})
