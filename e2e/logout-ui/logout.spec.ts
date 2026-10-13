import { test, expect } from '@playwright/test'
import { createChunks, stringToBase64URL } from '@supabase/ssr'
import type { BrowserContext, Page } from '@playwright/test'

const key = 'sb-127-auth-token'
async function seedSession(context: BrowserContext, outage = false, expired = false) {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600)
  const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000105', exp, aal: 'aal1', outage })).toString('base64url')}.synthetic-signature`
  const session = { access_token: jwt, refresh_token: outage ? 'synthetic-refresh-outage' : 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: '00000000-0000-0000-0000-000000000105', email: 'logout@disposable.test', user_metadata: { full_name: 'Logout Test', padding: 'x'.repeat(7000) }, factors: [] } }
  const chunks = createChunks(key, `base64-${stringToBase64URL(JSON.stringify(session))}`)
  expect(chunks.length).toBeGreaterThan(1)
  await context.addCookies([...chunks, { name: `${key}-code-verifier`, value: 'synthetic' }].map(cookie => ({ ...cookie, url: 'http://127.0.0.1:3106', sameSite: 'Lax' as const })))
}
async function expectPrivateAccessDenied(page: Page, context: BrowserContext) {
  expect((await context.cookies()).filter(cookie => cookie.name.startsWith(key))).toEqual([])
  expect((await page.request.get('/api/ai-assistant/books')).status()).toBe(401)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login\?next=/)
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
}
for (const scope of ['local', 'global'] as const) {
  for (const outage of [false, true]) {
    test(`dashboard ${scope}, provider ${outage ? 'outage' : 'success'}: clears chunks and denies subsequent private access`, async ({ page, context }) => {
      await seedSession(context, outage)
      await page.goto('/dashboard')
      if (test.info().project.name === 'mobile') await page.getByRole('button', { name: 'Open menu' }).click()
      const response = page.waitForResponse(`/api/auth/signout?scope=${scope}`)
      await page.getByRole('button', { name: scope === 'global' ? 'Sign out all devices' : 'Sign out', exact: true }).click()
      expect((await response).status()).toBe(outage ? 503 : 204)
      await expect(page).toHaveURL(outage ? /\/login\?logout=/ : /\/login$/)
      if (outage) await expect(page.getByRole('alert')).toContainText(scope === 'global' ? 'all devices could not be confirmed' : 'server could not confirm')
      await expectPrivateAccessDenied(page, context)
    })
  }
}
test('public logout clears credentials even when the app request never reaches the server', async ({ page, context }) => {
  await seedSession(context)
  await page.goto('/')
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.route('**/api/auth/signout?scope=local', route => route.abort('failed'))
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?logout=local_only/)
  await expect(page.getByRole('alert')).toContainText('signed out of this browser')
  await expectPrivateAccessDenied(page, context)
})
test('expired session logout bypasses unavailable refresh and deletes chunks', async ({ page, context }) => {
  await seedSession(context, true, true)
  const response = await context.request.post('/api/auth/signout')
  expect(response.status()).toBe(503)
  expect(await response.json()).toMatchObject({ localCleared: true, remoteRevoked: false })
  await expectPrivateAccessDenied(page, context)
})

test('editor logout asks once, honors cancellation, and preserves recovery after confirmation', async ({ page, context }) => {
  await seedSession(context)
  await page.goto('/dashboard/posts/new')
  await expect(page.getByLabel('Post title')).toBeVisible()
  await page.getByLabel('Post title').fill('Writing retained after logout')
  if (test.info().project.name === 'mobile') await page.getByRole('button', { name: 'Open menu' }).click()
  const dialogs: string[] = []
  const dismiss = async (dialog: import('@playwright/test').Dialog) => { dialogs.push(dialog.type()); await dialog.dismiss() }
  page.on('dialog', dismiss)
  const editorURL = page.url()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(editorURL)
  expect((await context.cookies()).some(cookie => cookie.name.startsWith(key))).toBe(true)
  expect(dialogs).toEqual(['confirm'])
  page.off('dialog', dismiss)
  page.on('dialog', async dialog => { dialogs.push(dialog.type()); if (dialog.type() === 'beforeunload') await dialog.dismiss(); else await dialog.accept() })
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(dialogs).toEqual(['confirm', 'confirm'])
  const recoveries = await page.evaluate(() => Object.keys(localStorage).filter(name => name.startsWith('post-recovery:')).map(name => localStorage.getItem(name)))
  expect(recoveries.join('\n')).toContain('Writing retained after logout')
  await expectPrivateAccessDenied(page, context)
})

for (const scope of ['local', 'global'] as const) {
  test(`expired ${scope} session refreshes before remote revocation`, async ({ page, context }) => {
    await seedSession(context, false, true)
    const response = await context.request.post(`/api/auth/signout?scope=${scope}`)
    expect(response.status()).toBe(204)
    await expectPrivateAccessDenied(page, context)
  })
}
