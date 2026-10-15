import { test, expect } from '@playwright/test'
import { createChunks, stringToBase64URL } from '@supabase/ssr'

const key = 'sb-127-auth-token'
const first = '00000000-0000-0000-0000-000000000100'
const second = '00000000-0000-0000-0000-000000000101'
test.beforeEach(async ({ context }) => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000107', exp, aal: 'aal1' })).toString('base64url')}.synthetic-signature`
  const session = { access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: '00000000-0000-0000-0000-000000000107', email: 'mfa@disposable.test', user_metadata: {}, factors: [{ id: first, factor_type: 'totp', status: 'verified' }] } }
  await context.addCookies(createChunks(key, `base64-${stringToBase64URL(JSON.stringify(session))}`).map(cookie => ({ ...cookie, url: 'http://127.0.0.1:3107', sameSite: 'Lax' as const })))
})
test('recovers factor loading and challenge outages, renews expiry, and completes AAL2 with a selected factor', async ({ page }) => {
  let failFactorLoading = true
  await page.route('**/auth/v1/user', async route => {
    if (failFactorLoading) await route.fulfill({ headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' }, status: 500, json: { code: 'unexpected_failure', message: 'Synthetic outage' } })
    else await route.continue()
  })
  await page.goto('/mfa?next=%2Fdashboard%2Fprofile')
  await expect(page.locator('[data-slot=alert]')).toContainText('Unable to load authenticators')
  failFactorLoading = false
  await page.getByRole('button', { name: 'Retry loading authenticators' }).click()
  await page.getByLabel('Authenticator', { exact: true }).selectOption(second)
  const code = page.getByLabel('Verification Code', { exact: true })
  let challenges = 0
  const ids: string[] = []
  await page.route('**/auth/v1/factors/*/challenge', async route => {
    expect(route.request().url()).toContain(second)
    if (++challenges === 1) await route.fulfill({ headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' }, status: 500, json: { code: 'unexpected_failure', message: 'Synthetic outage' } })
    else { const response = await route.fetch(); const body = await response.json(); ids.push(body.id); await route.fulfill({ response }) }
  })
  let attempts = 0
  await page.route('**/auth/v1/factors/*/verify', async route => {
    expect(route.request().url()).toContain(second)
    if (++attempts === 1) await route.fulfill({ headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' }, status: 422, json: { code: 'mfa_challenge_expired', message: 'Synthetic expiry' } })
    else await route.continue()
  })
  await code.fill('123456')
  await code.press('Enter')
  await expect(page.locator('[data-slot=alert]')).toContainText('temporarily unavailable')
  await code.press('Enter')
  await expect(page.locator('[data-slot=alert]')).toContainText('Verification expired')
  await expect(code).toHaveValue('')
  await code.fill('654321')
  await code.press('Enter')
  await expect(page).toHaveURL(/\/dashboard\/profile$/)
  await expect(page.getByRole('heading', { name: 'My Profile', exact: true })).toBeVisible()
  expect(challenges).toBe(3)
  expect(ids).toHaveLength(2)
  expect(ids[0]).not.toBe(ids[1])
  // The new session must pass server-side assurance after a full navigation.
  await page.reload()
  await expect(page).toHaveURL(/\/dashboard\/profile$/)
  await expect(page.getByRole('heading', { name: 'My Profile', exact: true })).toBeVisible()
  expect((await page.request.get('/mfa', { maxRedirects: 0 })).headers().location).toContain('/dashboard')
})
test('rapid Enter is serialized and rate limits, invalid codes, missing factors and network errors remain recoverable', async ({ page }) => {
  await page.goto('/mfa')
  const code = page.getByLabel('Verification Code', { exact: true })
  await expect(code).toBeEnabled()
  let challenges = 0
  await page.route('**/auth/v1/factors/*/challenge', async route => {
    challenges++
    // Hold a real request boundary while repeated form submissions arrive.
    await new Promise(resolve => setTimeout(resolve, 300))
    await route.continue()
  })
  const errors = [
    { status: 429, code: 'over_request_rate_limit', text: 'Too many attempts' },
    { status: 422, code: 'mfa_verification_failed', text: 'Invalid code' },
    { status: 404, code: 'mfa_factor_not_found', text: 'no longer available' },
  ]
  let attempts = 0
  await page.route('**/auth/v1/factors/*/verify', async route => {
    const error = errors[attempts++]
    if (error) await route.fulfill({ headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' }, status: error.status, json: { code: error.code, message: 'Synthetic error' } })
    else await route.abort('failed')
  })
  for (const [index, error] of errors.entries()) {
    await code.fill('123456')
    if (index === 0) {
      await code.press('Enter')
      // requestSubmit exercises the Enter path even while the input is disabled.
      await page.locator('form').evaluate(form => { for (let i = 0; i < 10; i++) (form as HTMLFormElement).requestSubmit() })
    } else await code.press('Enter')
    await expect(page.locator('[data-slot=alert]')).toContainText(error.text)
    await expect(page.getByRole('button', { name: 'Verify', exact: true })).toBeEnabled()
    expect(challenges).toBe(index + 1)
    expect(attempts).toBe(index + 1)
  }
  await code.press('Enter')
  await expect(page.locator('[data-slot=alert]')).toContainText('temporarily unavailable')
  await expect(page.getByRole('button', { name: 'Verify', exact: true })).toBeEnabled()
})
test('missing factors keep recovery help and sign-out accessible', async ({ page, context }) => {
  await page.route('**/auth/v1/user', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...await response.json(), factors: [] } })
  })
  await page.goto('/mfa')
  await expect(page.locator('[data-slot=alert]')).toContainText('No verified authenticator')
  await page.getByText('Lost access to your authenticator?').click()
  await expect(page.getByText(/administrator.*verify your identity/)).toBeVisible()
  await expect(page.getByText(/password reset does not remove/)).toBeVisible()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect((await context.cookies()).filter(cookie => cookie.name.startsWith(key))).toEqual([])
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login\?next=/)
})
