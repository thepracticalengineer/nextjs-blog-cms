import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const confirmation = 'If an account exists for this email, you’ll receive a password reset link.'
const initialPassword = 'OldPassword123!'
const newPassword = 'NewPassword456!'
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function requestReset(page: Page, email: string) {
  await page.goto('/forgot-password')
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toHaveText(confirmation)
}

// This test deliberately uses a real SMTP-captured email, never admin.generateLink
// or a mocked password update, to cover the template and redirect configuration.
test('real email recovery works in a fresh browser and rejects reused links', async ({ page, browser, request }) => {
  test.setTimeout(120_000)
  const mailpit = process.env.E2E_MAILPIT_URL
  if (!mailpit) throw new Error('Set E2E_MAILPIT_URL to the dedicated test stack Mailpit origin')
  const email = `recovery-${randomUUID()}@playwright.local`
  const { data, error } = await admin().auth.admin.createUser({ email, password: initialPassword, email_confirm: true })
  if (error || !data.user) throw new Error('Unable to create disposable recovery user')
  const userId = data.user.id
  const fresh = await browser.newContext()
  try {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    await page.getByLabel('Email address').fill('not-an-email')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /valid email|missing, expired/ })).toHaveText('Enter a valid email address')
    await requestReset(page, email)

    let messageId: string | undefined
    await expect.poll(async () => {
      const response = await request.get(`${mailpit}/api/v1/search`, { params: { query: `to:${email}` } })
      if (!response.ok()) throw new Error('Cannot read dedicated test mailbox')
      const inbox = await response.json()
      messageId = inbox.messages?.[0]?.ID
      return !!messageId
    }, { timeout: 20_000 }).toBe(true)
    const message = await (await request.get(`${mailpit}/api/v1/message/${messageId}`)).json()
    const href = message.HTML.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&')
    if (!href) throw new Error('Reset email has no recovery link')
    const link = new URL(href)
    expect(link.origin).toBe(new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000').origin)
    expect(link.searchParams.get('type')).toBe('recovery')
    expect(link.searchParams.get('token_hash')).toBeTruthy()

    const recoveryPage = await fresh.newPage()
    await recoveryPage.goto(href)
    await expect(recoveryPage).toHaveURL(/\/reset-password$/)
    await expect(recoveryPage.getByLabel('New password', { exact: true })).toBeVisible()
    await recoveryPage.getByLabel('New password', { exact: true }).fill('short')
    await recoveryPage.getByLabel('Confirm new password').fill('short')
    await recoveryPage.getByRole('button', { name: 'Update password' }).click()
    await expect(recoveryPage.getByRole('alert').filter({ hasText: /Password|password|missing, expired/ })).toHaveText('Password must be at least 8 characters')
    await recoveryPage.getByLabel('New password', { exact: true }).fill(newPassword)
    await recoveryPage.getByLabel('Confirm new password').fill('DifferentPassword!')
    await recoveryPage.getByRole('button', { name: 'Update password' }).click()
    await expect(recoveryPage.getByRole('alert').filter({ hasText: /Password|password|missing, expired/ })).toHaveText('Passwords do not match')
    await recoveryPage.getByLabel('Confirm new password').fill(newPassword)
    await recoveryPage.getByRole('button', { name: 'Update password' }).click()
    await expect(recoveryPage.getByRole('status')).toContainText('Sign in with your new password')
    await recoveryPage.getByRole('link', { name: 'Back to sign in' }).click()
    await expect(recoveryPage).toHaveURL(/\/login$/)
    await recoveryPage.getByLabel('Email address').fill(email)
    await recoveryPage.getByLabel('Password', { exact: true }).fill(newPassword)
    await recoveryPage.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(recoveryPage).toHaveURL(/\/dashboard$/)

    const oldLogin = await anon().auth.signInWithPassword({ email, password: initialPassword })
    expect(oldLogin.error?.code).toBe('invalid_credentials')
    // A normal session cannot authorize recovery even after a successful login.
    await recoveryPage.goto('/reset-password')
    await expect(recoveryPage.getByRole('alert').filter({ hasText: /Password|password|missing, expired/ })).toContainText('missing, expired, invalid, or already used')
    await recoveryPage.goto(href)
    await expect(recoveryPage.getByRole('alert').filter({ hasText: /Password|password|missing, expired/ })).toContainText('missing, expired, invalid, or already used')
    await expect(recoveryPage.getByRole('link', { name: 'Request a new reset link' })).toBeVisible()
    expect((await admin().from('password_recovery_grants').select('id').eq('user_id', userId)).data).toEqual([])

    await requestReset(page, `unregistered-${randomUUID()}@playwright.local`)
  } finally {
    await fresh.close()
    const cleanup = await admin().auth.admin.deleteUser(userId)
    if (cleanup.error) throw new Error('Unable to clean up disposable recovery user')
  }
})

test('missing and invalid recovery links expose a keyboard-accessible retry path on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const path of ['/reset-password', '/auth/callback?type=recovery', '/auth/callback?type=recovery&token_hash=invalid']) {
    await page.goto(path)
    await expect(page.getByRole('alert').filter({ hasText: /valid email|missing, expired/ })).toContainText('missing, expired, invalid, or already used')
    await expect(page.getByRole('button', { name: 'Update password' })).toHaveCount(0)
    const retry = page.getByRole('link', { name: 'Request a new reset link' })
    await retry.focus()
    await expect(retry).toBeFocused()
  }
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/forgot-password$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('recovery storage rejects public access, expired grants, and concurrent replay', async () => {
  const email = `grant-${randomUUID()}@playwright.local`
  const { data, error } = await admin().auth.admin.createUser({ email, password: initialPassword, email_confirm: true })
  if (error || !data.user) throw new Error('Unable to create disposable grant user')
  const userId = data.user.id
  const service = admin()
  const expiredId = randomUUID()
  const id = randomUUID()
  const sessionId = randomUUID()
  try {
    const inserted = await service.from('password_recovery_grants').insert([
      { id, user_id: userId, session_id: sessionId, expires_at: new Date(Date.now() + 60_000).toISOString() },
      { id: expiredId, user_id: userId, session_id: sessionId, expires_at: new Date(Date.now() - 60_000).toISOString() },
    ])
    expect(inserted.error).toBeNull()
    expect((await anon().from('password_recovery_grants').select('id')).error).not.toBeNull()
    const authenticated = anon()
    expect((await authenticated.auth.signInWithPassword({ email, password: initialPassword })).error).toBeNull()
    expect((await authenticated.from('password_recovery_grants').select('id')).error).not.toBeNull()
    expect((await authenticated.from('password_recovery_grants').insert({ id: randomUUID(), user_id: userId, session_id: sessionId, expires_at: new Date().toISOString() })).error).not.toBeNull()

    const consume = (grantId: string) => service.from('password_recovery_grants').delete()
      .eq('id', grantId).eq('user_id', userId).eq('session_id', sessionId)
      .gt('expires_at', new Date().toISOString()).select('id').maybeSingle()
    expect((await consume(expiredId)).data).toBeNull()
    const attempts = await Promise.all([consume(id), consume(id)])
    expect(attempts.every(attempt => !attempt.error)).toBe(true)
    expect(attempts.filter(attempt => attempt.data).length).toBe(1)
  } finally {
    expect((await service.auth.admin.deleteUser(userId)).error).toBeNull()
  }
})
