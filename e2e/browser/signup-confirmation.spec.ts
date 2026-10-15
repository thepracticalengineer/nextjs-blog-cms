import { test, expect } from '../fixtures'
import type { APIRequestContext, Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { CONFIRMATION_SENT } from '../../lib/auth/confirmation'

const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const password = 'SignupTestPassword123!'

async function signup(page: Page, email: string) {
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Signup Test')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: false }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  const { data: user, error } = await service().from('profiles').select('id').eq('email', email).single()
  if (error || !user) throw new Error('Unable to find disposable signup user')
  return user.id
}

async function confirmationLink(request: APIRequestContext, email: string, oldLink?: string) {
  const mailpit = process.env.E2E_MAILPIT_URL
  if (!mailpit || !['localhost', '127.0.0.1'].includes(new URL(mailpit).hostname)) {
    throw new Error('Signup tests require a loopback E2E_MAILPIT_URL')
  }
  let link = ''
  await expect.poll(async () => {
    const inbox = await request.get(`${mailpit}/api/v1/search`, { params: { query: `to:${email}` } })
    expect(inbox.ok()).toBe(true)
    for (const item of (await inbox.json()).messages ?? []) {
      const message = await (await request.get(`${mailpit}/api/v1/message/${item.ID}`)).json()
      const href = message.HTML.match(/href="([^"]*token_hash[^"]*)"/)?.[1]?.replaceAll('&amp;', '&')
      if (href && href !== oldLink) { link = href; return true }
    }
    return false
  }, { timeout: 20_000 }).toBe(true)
  const parsed = new URL(link)
  expect(parsed.origin).toBe(new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000').origin)
  expect(parsed.pathname).toBe('/auth/callback')
  expect(parsed.searchParams.get('type')).toBe('signup')
  expect(parsed.searchParams.get('token_hash')).toBeTruthy()
  return link
}

for (const freshBrowser of [false, true]) {
  test(`real signup email confirms in ${freshBrowser ? 'a fresh' : 'the initiating'} browser and rejects replay`, async ({ page, browser, request }) => {
    const email = `signup-${randomUUID()}@playwright.local`
    const userId = await signup(page, email)
    const fresh = await browser.newContext()
    try {
      const link = await confirmationLink(request, email)
      const confirmationPage = freshBrowser ? await fresh.newPage() : page
      if (freshBrowser) {
        // Changing a signup link's type must not turn it into a recovery grant.
        const forgedRecovery = new URL(link)
        forgedRecovery.searchParams.set('type', 'recovery')
        await confirmationPage.goto(forgedRecovery.toString())
        await expect(confirmationPage).toHaveURL(/\/reset-password\?error=invalid_recovery$/)
        expect((await service().from('password_recovery_grants').select('id').eq('user_id', userId)).data).toEqual([])
        expect((await service().auth.admin.getUserById(userId)).data.user?.email_confirmed_at).toBeFalsy()
      }
      await confirmationPage.goto(link)
      await expect(confirmationPage).toHaveURL(/\/dashboard$/)
      expect((await service().auth.admin.getUserById(userId)).data.user?.email_confirmed_at).toBeTruthy()
      expect((await service().from('password_recovery_grants').select('id').eq('user_id', userId)).data).toEqual([])

      // A new context proves the server rejects replay independently of a session.
      const replay = await browser.newContext()
      try {
        const replayPage = await replay.newPage()
        await replayPage.goto(link)
        await expect(replayPage).toHaveURL(/\/login\?error=invalid_confirmation$/)
        await expect(replayPage.getByRole('alert').filter({ hasText: 'This confirmation link' })).toContainText('invalid, expired, or already used')
        await expect(replayPage.getByRole('link', { name: 'Request a new confirmation link' })).toBeVisible()
      } finally { await replay.close() }
    } finally {
      await fresh.close()
      expect((await service().auth.admin.deleteUser(userId)).error).toBeNull()
    }
  })
}

test('signup without a redirect option still emails a usable canonical confirmation link', async ({ page, request }) => {
  const email = `fallback-signup-${randomUUID()}@playwright.local`
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false, flowType: 'pkce' },
  })
  const { data, error } = await client.auth.signUp({ email, password })
  if (error || !data.user) throw new Error('Unable to create disposable fallback signup')
  try {
    await page.goto(await confirmationLink(request, email))
    await expect(page).toHaveURL(/\/dashboard$/)
    expect((await service().auth.admin.getUserById(data.user.id)).data.user?.email_confirmed_at).toBeTruthy()
  } finally { expect((await service().auth.admin.deleteUser(data.user.id)).error).toBeNull() }
})

test('expired signup email offers neutral resend, enforces cooldown and accepts the new link', async ({ page, request }) => {
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname
  const container = process.env.E2E_AUTH_DB_CONTAINER ?? 'supabase_db_nextjs-blog-cms'
  if (!['localhost', '127.0.0.1'].includes(host) || !['supabase_db_nextjs-blog-cms', 'supabase_db_cms-issue106'].includes(container)) {
    throw new Error('Expiry fixture is restricted to the designated local Auth database containers')
  }
  const email = `expired-signup-${randomUUID()}@playwright.local`
  const userId = await signup(page, email)
  try {
    const oldLink = await confirmationLink(request, email)
    if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error('Unexpected disposable user ID')
    execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
      input: `UPDATE auth.users SET confirmation_sent_at = now() - interval '2 hours' WHERE id = '${userId}'::uuid;`,
    })
    await page.goto(oldLink)
    await expect(page.getByRole('alert').filter({ hasText: 'This confirmation link' })).toContainText('invalid, expired, or already used')
    await page.getByRole('link', { name: 'Request a new confirmation link' }).click()
    await expect(page).toHaveURL(/\/confirm-email$/)
    await expect(page.getByRole('heading', { name: 'Confirm your email', exact: true })).toBeVisible()
    await page.getByLabel('Email address').fill(email)
    await page.getByRole('button', { name: 'Send confirmation link' }).click()
    await expect(page.getByRole('status')).toHaveText(CONFIRMATION_SENT)
    await expect(page.getByRole('button', { name: /Wait \d+ seconds to resend/ })).toBeDisabled()
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    // Bypassing the UI still cannot send another email inside the provider interval.
    expect((await anon.auth.resend({ type: 'signup', email })).error?.code).toBe('over_email_send_rate_limit')
    const newLink = await confirmationLink(request, email, oldLink)
    await page.goto(newLink)
    await expect(page).toHaveURL(/\/dashboard$/)
  } finally { expect((await service().auth.admin.deleteUser(userId)).error).toBeNull() }
})

test('invalid and unsupported token types show an actionable error on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const query of ['type=signup', 'type=signup&token_hash=invalid', 'type=email&token_hash=invalid', 'type=invite&token_hash=invalid']) {
    await page.goto(`/auth/callback?${query}`)
    await expect(page.getByRole('alert').filter({ hasText: 'This confirmation link' })).toContainText('request a new confirmation link')
    const retry = page.getByRole('link', { name: 'Request a new confirmation link' })
    await retry.focus()
    await expect(retry).toBeFocused()
  }
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/confirm-email$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('unknown and already-confirmed addresses receive the same neutral resend response', async ({ page }) => {
  const email = `confirmed-signup-${randomUUID()}@playwright.local`
  const created = await service().auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error || !created.data.user) throw new Error('Unable to create disposable confirmed account')
  try {
    for (const address of [email, `unknown-${randomUUID()}@playwright.local`]) {
      await page.goto('/confirm-email')
      await page.getByLabel('Email address').fill(address)
      await page.getByRole('button', { name: 'Send confirmation link' }).click()
      await expect(page.getByRole('status')).toHaveText(CONFIRMATION_SENT)
      await expect(page.getByRole('button', { name: /Wait \d+ seconds to resend/ })).toBeDisabled()
    }
  } finally { expect((await service().auth.admin.deleteUser(created.data.user.id)).error).toBeNull() }
})
