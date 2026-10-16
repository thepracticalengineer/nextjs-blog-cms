import { test, expect, type Page } from '../coverage/fixture'
import type { APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { createHmac, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { assertDedicatedTestProject } from '../environment'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
function client(key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Age only our disposable user's session, never a remote database or another
// project's local stack. This reproduces Auth's real 24-hour gate without mocks.
function localAuthFixture(userId: string, sql: string) {
  assertDedicatedTestProject(url, process.env.E2E_SUPABASE_PROJECT_REF)
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Session aging requires the disposable local stack')
  const container = process.env.E2E_AUTH_DB_CONTAINER ?? 'supabase_db_nextjs-blog-cms'
  if (!['supabase_db_nextjs-blog-cms', 'supabase_db_cms-issue104', 'supabase_db_cms-issue106'].includes(container)) throw new Error('Unexpected test database container')
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error('Invalid fixture UUID')
  return execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c',
    sql], { encoding: 'utf8' })
}

function ageLocalSession(userId: string, sessionId: string) {
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) throw new Error('Invalid session UUID')
  localAuthFixture(userId, `UPDATE auth.sessions SET created_at = now() - interval '25 hours' WHERE id = '${sessionId}'::uuid AND user_id = '${userId}'::uuid;`)
}

function localSessionCount(userId: string) {
  return Number(localAuthFixture(userId, `SELECT count(*) FROM auth.sessions WHERE user_id = '${userId}'::uuid;`).trim())
}

function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret.toUpperCase().replace(/=+$/, '')].map(char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('')
  const key = Buffer.from(bits.match(/.{8}/g)!.map(byte => parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const hash = createHmac('sha1', key).update(counter).digest()
  const offset = hash[hash.length - 1] & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

async function mailbox(request: APIRequestContext, email: string, subject: string) {
  const origin = process.env.E2E_MAILPIT_URL
  if (!origin || !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Use the disposable local Mailpit mailbox')
  let id: string | undefined
  await expect.poll(async () => {
    const response = await request.get(`${origin}/api/v1/search`, { params: { query: `to:${email} subject:"${subject}"` } })
    expect(response.ok()).toBe(true)
    const inbox = await response.json()
    id = inbox.messages?.[0]?.ID
    return !!id
  }, { timeout: 20_000 }).toBe(true)
  return (await request.get(`${origin}/api/v1/message/${id}`)).json()
}

async function fillPasswords(page: Page, current: string, next: string) {
  await page.getByLabel('Current Password', { exact: true }).fill(current)
  await page.getByLabel('New Password', { exact: true }).fill(next)
  await page.getByLabel('Confirm New Password', { exact: true }).fill(next)
}

test('provider enforces the minimum, recent-session exception, old-session nonce, and notifications', async ({ request }) => {
  assertDedicatedTestProject(url, process.env.E2E_SUPABASE_PROJECT_REF)
  const service = client(process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const email = `policy-${randomUUID()}@playwright.local`
  const initialPassword = 'InitialPassword123!'
  const created = await service.auth.admin.createUser({ email, password: initialPassword, email_confirm: true })
  expect(created.error).toBeNull()
  const userId = created.data.user!.id
  try {
    const auth = client()
    expect((await auth.auth.signInWithPassword({ email, password: initialPassword })).error).toBeNull()
    for (const password of ['123456', '1234567']) {
      expect((await auth.auth.updateUser({ password })).error?.code).toBe('weak_password')
    }
    expect((await auth.auth.updateUser({ password: '12345678' })).error).toBeNull()
    await mailbox(request, email, 'Your password has been changed')
    const session = (await auth.auth.getSession()).data.session!
    const sessionId = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString()).session_id
    ageLocalSession(userId, sessionId)
    expect((await auth.auth.updateUser({ password: 'AnotherPassword123!' })).error?.code).toBe('reauthentication_needed')
    // Signing in via a separate client cannot reauthenticate this session.
    expect((await client().auth.signInWithPassword({ email, password: '12345678' })).error).toBeNull()
    expect((await auth.auth.updateUser({ password: 'AnotherPassword123!' })).error?.code).toBe('reauthentication_needed')
    expect((await auth.auth.reauthenticate()).error).toBeNull()
    const mail = await mailbox(request, email, 'Verify your password change')
    const nonce = mail.Text.match(/\b\d{6}\b/)?.[0]
    expect(nonce).toBeTruthy()
    const invalid = nonce!.slice(0, 5) + ((Number(nonce![5]) + 1) % 10)
    expect((await auth.auth.updateUser({ password: 'AnotherPassword123!', nonce: invalid })).error?.code).toBe('reauthentication_not_valid')
    expect((await auth.auth.updateUser({ password: 'AnotherPassword123!', nonce })).error).toBeNull()
    expect((await auth.auth.updateUser({ password: 'ReplayPassword123!', nonce })).error?.code).toBe('reauthentication_not_valid')
    expect((await client().auth.signInWithPassword({ email, password: 'AnotherPassword123!' })).error).toBeNull()
  } finally {
    expect((await service.auth.admin.deleteUser(userId)).error).toBeNull()
  }
})

test('account settings reject bypassed browser validation and complete an old-session email challenge', async ({ page, request }) => {
  assertDedicatedTestProject(url, process.env.E2E_SUPABASE_PROJECT_REF)
  const service = client(process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const email = `settings-password-${randomUUID()}@playwright.local`
  const initialPassword = 'InitialPassword123!'
  const newPassword = 'NewSettingsPassword123!'
  const created = await service.auth.admin.createUser({ email, password: initialPassword, email_confirm: true })
  expect(created.error).toBeNull()
  const userId = created.data.user!.id
  try {
    await page.goto('/login')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(initialPassword)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goto('/dashboard/profile')
    // Alter the Server Action payload after the browser has accepted the form.
    let bypassed = false
    await page.route('**/dashboard/profile', async route => {
      const request = route.request()
      const body = request.postData()
      if (request.method() === 'POST' && request.headers()['next-action'] && body?.includes(newPassword)) {
        bypassed = true
        await route.continue({ postData: body.replace(JSON.stringify(newPassword), JSON.stringify('1234567')) })
      } else await route.continue()
    })
    await fillPasswords(page, initialPassword, newPassword)
    await page.getByRole('button', { name: 'Update Password', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Password must be at least 8 characters' })).toBeVisible()
    expect(bypassed).toBe(true)
    await page.unroute('**/dashboard/profile')
    expect((await client().auth.signInWithPassword({ email, password: initialPassword })).error).toBeNull()
    // Read the signed session ID from the browser cookies, then age only it.
    const cookies = (await page.context().cookies()).filter(cookie => /^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name)).sort((a, b) => a.name.localeCompare(b.name))
    const serialized = cookies.map(cookie => cookie.value).join('')
    const session = JSON.parse(Buffer.from(serialized.replace(/^base64-/, ''), 'base64url').toString())
    const sessionId = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString()).session_id
    ageLocalSession(userId, sessionId)
    const sessionCount = localSessionCount(userId)
    await page.getByRole('button', { name: 'Update Password', exact: true }).click()
    await expect(page.getByLabel('Email verification code')).toBeVisible()
    expect(localSessionCount(userId)).toBe(sessionCount)
    const mail = await mailbox(request, email, 'Verify your password change')
    const nonce = mail.Text.match(/\b\d{6}\b/)?.[0]
    expect(nonce).toBeTruthy()
    const invalid = nonce!.slice(0, 5) + ((Number(nonce![5]) + 1) % 10)
    await page.getByLabel('Email verification code').fill(invalid)
    await page.getByRole('button', { name: 'Update Password', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'invalid or expired' })).toBeVisible()
    expect(localSessionCount(userId)).toBe(sessionCount)
    await page.getByLabel('Email verification code').fill(nonce!)
    await page.getByRole('button', { name: 'Update Password', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Password updated' })).toBeVisible()
    await expect(page.getByLabel('Email verification code')).toHaveCount(0)
    expect((await client().auth.signInWithPassword({ email, password: newPassword })).error).toBeNull()
    expect((await client().auth.signInWithPassword({ email, password: initialPassword })).error?.code).toBe('invalid_credentials')
    await mailbox(request, email, 'Your password has been changed')
  } finally {
    expect((await service.auth.admin.deleteUser(userId)).error).toBeNull()
  }
})


test('legacy six-character passwords still log in and can be changed in account settings', async ({ page }) => {
  assertDedicatedTestProject(url, process.env.E2E_SUPABASE_PROJECT_REF)
  const service = client(process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const email = `legacy-password-${randomUUID()}@playwright.local`
  const created = await service.auth.admin.createUser({ email, password: 'InitialPassword123!', email_confirm: true })
  expect(created.error).toBeNull()
  const userId = created.data.user!.id
  try {
    // Existing hashes predate the new policy; new account creation must still
    // enforce it. Mutate only this disposable local fixture to model a legacy hash.
    localAuthFixture(userId, `UPDATE auth.users SET encrypted_password = extensions.crypt('legacy', extensions.gen_salt('bf')) WHERE id = '${userId}'::uuid;`)
    expect((await client().auth.signInWithPassword({ email, password: 'legacy' })).error).toBeNull()
    await page.goto('/login')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('legacy')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goto('/dashboard/profile')
    await fillPasswords(page, 'legacy', 'UpdatedLegacyPassword123!')
    await page.getByRole('button', { name: 'Update Password', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Password updated' })).toBeVisible()
    expect((await client().auth.signInWithPassword({ email, password: 'UpdatedLegacyPassword123!' })).error).toBeNull()
  } finally {
    expect((await service.auth.admin.deleteUser(userId)).error).toBeNull()
  }
})

test('MFA rejects direct AAL1 updates and account settings retain AAL2 through an old-session password change', async ({ page, request, baseURL }) => {
  assertDedicatedTestProject(url, process.env.E2E_SUPABASE_PROJECT_REF)
  const service = client(process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const email = `mfa-password-${randomUUID()}@playwright.local`
  const initialPassword = 'InitialPassword123!'
  const created = await service.auth.admin.createUser({ email, password: initialPassword, email_confirm: true })
  expect(created.error).toBeNull()
  const userId = created.data.user!.id
  const jar = new Map<string, string>()
  const auth = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: cookies => cookies.forEach(({ name, value }) => { if (value) jar.set(name, value); else jar.delete(name) }),
  } })
  try {
    expect((await auth.auth.signInWithPassword({ email, password: initialPassword })).error).toBeNull()
    const enrollment = await auth.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Password policy fixture' })
    expect(enrollment.error).toBeNull()
    expect((await auth.auth.mfa.challengeAndVerify({ factorId: enrollment.data!.id, code: totp(enrollment.data!.totp.secret) })).error).toBeNull()
    const aal1 = client()
    expect((await aal1.auth.signInWithPassword({ email, password: initialPassword })).error).toBeNull()
    expect((await aal1.auth.updateUser({ password: 'NewMfaPassword123!' })).error?.code).toBe('insufficient_aal')
    const session = (await auth.auth.getSession()).data.session!
    const sessionId = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString()).session_id
    ageLocalSession(userId, sessionId)
    await page.context().addCookies([...jar].map(([name, value]) => ({ name, value, domain: new URL(baseURL!).hostname, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const })))
    await page.goto('/dashboard/profile')
    await fillPasswords(page, initialPassword, 'NewMfaPassword123!')
    await page.getByRole('button', { name: 'Update Password', exact: true }).click()
    await expect(page.getByLabel('Email verification code')).toBeVisible()
    const mail = await mailbox(request, email, 'Verify your password change')
    const nonce = mail.Text.match(/\b\d{6}\b/)?.[0]
    expect(nonce).toBeTruthy()
    await page.getByLabel('Email verification code').fill(nonce!)
    await page.getByRole('button', { name: 'Update Password', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Password updated' })).toBeVisible()
    // Private API access proves the original AAL2 session was not replaced by
    // the temporary AAL1 password-verification session.
    expect((await page.request.get('/api/ai-assistant/books')).status()).toBe(200)
    expect((await client().auth.signInWithPassword({ email, password: 'NewMfaPassword123!' })).error).toBeNull()
  } finally {
    expect((await service.auth.admin.deleteUser(userId)).error).toBeNull()
  }
})
