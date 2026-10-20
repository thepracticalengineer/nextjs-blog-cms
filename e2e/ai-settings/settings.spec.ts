import { test, expect } from '@playwright/test'
import { createChunks, stringToBase64URL } from '@supabase/ssr'

const owner = '00000000-0000-0000-0000-000000000111'
const stub = 'http://127.0.0.1:54994'
const endpoint = '/api/settings/ai-providers'

test.beforeEach(async ({ context, request }) => {
  await request.post(`${stub}/__control`, { data: {} })
  const exp = Math.floor(Date.now() / 1000) + 3600
  const access_token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: owner, exp, aal: 'aal1' })).toString('base64url')}.synthetic-signature`
  const session = { access_token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: owner, email: 'settings@disposable.test', user_metadata: {}, factors: [] } }
  await context.addCookies(createChunks('sb-127-auth-token', `base64-${stringToBase64URL(JSON.stringify(session))}`).map(cookie => ({ ...cookie, url: 'http://127.0.0.1:3111', sameSite: 'Lax' as const })))
  // Provider verification is deliberately never invoked in this suite.
  await context.route('**/*', route => {
    const host = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort('blockedbyclient')
  })
})

test('settings save an encrypted owner key, reload masked metadata and confirm removal', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/dashboard/settings/ai-providers')
  await expect(page.getByRole('heading', { name: 'AI Providers', exact: true })).toBeVisible()
  const input = page.getByLabel('OpenAI API key', { exact: true })
  await expect(input).toBeEnabled()
  await expect(input).toHaveAttribute('type', 'password')
  const secret = 'sk-synthetic-settings-key-must-remain-private'
  await input.fill(secret)
  const saved = page.waitForResponse(response => response.url().endsWith(endpoint) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Save OpenAI key', exact: true }).click()
  const response = await saved
  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ provider: 'openai', is_valid: null, key_preview: '...vate' })
  await expect(page.getByText('Saved, unverified', { exact: true })).toBeVisible()
  await expect(input).toHaveValue('')
  expect(await page.content()).not.toContain(secret)
  const persisted = await request.get(`${stub}/__state`).then(result => result.json())
  expect(persisted.writes).toBe(1)
  expect(persisted.keys).toHaveLength(1)
  expect(persisted.keys[0]).toMatchObject({ user_id: owner, provider: 'openai', is_valid: null })
  expect(persisted.keys[0].encrypted_key).not.toContain(secret)
  expect(persisted.keys[0].encrypted_key.split(':')).toHaveLength(3)

  await page.reload()
  await expect(page.getByText('Saved, unverified', { exact: true })).toBeVisible()
  await expect(input).toHaveValue('')
  const metadata = await page.request.get(endpoint).then(result => result.text())
  expect(metadata).not.toContain(secret)
  expect(metadata).not.toContain('encrypted_key')
  expect(await page.content()).not.toContain(secret)
  expect(await page.content()).not.toContain(persisted.keys[0].encrypted_key)
  if (test.info().project.name === 'mobile') await page.getByRole('button', { name: 'Open menu', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.locator('a[href^="/dashboard/ai-assistant"], a[href^="/dashboard/developer"]')).toHaveCount(0)
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Close menu', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Close menu', exact: true })).not.toBeInViewport()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/ai-settings-${test.info().project.name}.png`, fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Remove OpenAI key', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove OpenAI key', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Remove OpenAI key', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm remove OpenAI key', exact: true }).click()
  await expect(page.getByText('Key removed.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove OpenAI key', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(input).toBeEnabled()
  await expect(page.getByText('Saved, unverified', { exact: true })).toHaveCount(0)
  expect((await request.get(`${stub}/__state`).then(result => result.json())).keys).toEqual([])
  expect(errors).toEqual([])
})

test('settings load failure can retry and invalid save preserves the input without persistence', async ({ page, request }) => {
  await request.post(`${stub}/__control`, { data: { failLoads: 1 } })
  await page.goto('/dashboard/settings/ai-providers')
  await expect(page.getByRole('alert').filter({ hasText: 'could not be loaded' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry loading providers', exact: true }).click()
  const input = page.getByLabel('OpenAI API key', { exact: true })
  await expect(input).toBeEnabled()
  await expect(page.getByRole('alert').filter({ hasText: /could not be loaded/ })).toHaveCount(0)
  // Meets HTML minLength, but the server correctly rejects its trimmed length.
  await input.fill('short   ')
  const invalid = page.waitForResponse(response => response.url().endsWith(endpoint) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Save OpenAI key', exact: true }).click()
  expect((await invalid).status()).toBe(400)
  await expect(page.getByRole('alert').filter({ hasText: 'between 8 and 4096' })).toBeVisible()
  await expect(input).toHaveValue('short   ')
  await expect(page.getByRole('button', { name: 'Save OpenAI key', exact: true })).toBeEnabled()
  const state = await request.get(`${stub}/__state`).then(result => result.json())
  expect(state.keys).toEqual([])
  expect(state.writes).toBe(0)
})
