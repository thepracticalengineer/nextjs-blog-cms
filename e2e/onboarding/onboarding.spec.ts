import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { assertDedicatedTestProject } from '../environment'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
assertDedicatedTestProject(url, process.env.E2E_SUPABASE_PROJECT_REF)
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
const password = 'DisposableOnboarding123!'
const topic = '14600000-0000-4000-8000-000000000020'
let userId: string | undefined
let seededTopic = false

test.beforeAll(async () => {
  const result = await admin.from('tags').upsert({ id: topic, name: 'Onboarding TypeScript', slug: 'onboarding-typescript' }).select('id').single()
  if (result.error) throw result.error
  seededTopic = true
})
test.afterEach(async () => { if (userId) { await admin.auth.admin.deleteUser(userId); userId = undefined } })
test.afterAll(async () => { if (seededTopic) await admin.from('tags').delete().eq('id', topic) })

test('new account saves, resumes, retries and completes without losing the return destination', async ({ page, context }, info) => {
  const email = `onboarding-${info.project.name}-${Date.now()}@example.test`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'New Engineer' } })
  if (created.error || !created.data.user) throw created.error
  userId = created.data.user.id
  await page.goto('/login?next=%2Fblog')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A little about you' })).toBeVisible()
  await expect(page.getByLabel('Full name')).toHaveValue('New Engineer')
  await page.getByLabel('1–3 years', { exact: true }).check()
  await page.getByLabel('Software engineer', { exact: true }).check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'How did you find us?' })).toBeFocused()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'How did you find us?' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip this question' }).click()
  await page.getByLabel('Search topics').fill('Onboarding TypeScript')
  await page.getByLabel('Search topics').press('Tab')
  await expect(page.getByRole('button', { name: 'Onboarding TypeScript', exact: true })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Onboarding TypeScript', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: `test-results/onboarding/${info.project.name}-interests.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // Block one real server-action request, keeping the actual UI and database.
  let fail = true
  await page.route('**/dashboard/onboarding*', async route => {
    if (fail && route.request().method() === 'POST') { fail = false; await route.abort('failed'); return }
    await route.continue()
  })
  await page.getByRole('button', { name: 'Finish setup' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to save' })).toContainText('Unable to save')
  expect((await admin.from('onboarding_progress').select('completed_at').eq('user_id', userId).single()).data?.completed_at).toBeNull()
  await page.getByRole('button', { name: 'Finish setup' }).click()
  await expect(page).toHaveURL(/\/blog$/)
  const saved = await admin.from('onboarding_progress').select('*').eq('user_id', userId).single()
  expect(saved.data?.completed_at).toBeTruthy()
  expect(saved.data?.referral).toBe('')
  expect(saved.data?.interests).toContain(topic)
  const privateProfile = await admin.from('profiles').select('role').eq('id', userId).single()
  expect(privateProfile.data?.role).toBe('author')
  expect((await admin.from('newsletter_subscriptions').select('id').eq('email', email)).data).toEqual([])
  await context.clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('signup confirmation in a fresh browser honors the signed return target', async ({ page, browser }, info) => {
  const mailUrl = process.env.E2E_MAILPIT_URL
  test.skip(!mailUrl, 'Set E2E_MAILPIT_URL for local confirmation delivery verification.')
  const email = `onboarding-confirm-${info.project.name}-${Date.now()}@example.test`
  await page.goto('/register?next=%2Fblog')
  await page.getByLabel('Full name').fill('Fresh Browser')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  const users = await admin.auth.admin.listUsers()
  userId = users.data.users.find(user => user.email === email)?.id
  expect(userId).toBeTruthy()
  let messageId = ''
  await expect.poll(async () => {
    const result = await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then(response => response.json())
    messageId = result.messages?.[0]?.ID ?? ''
    return messageId
  }).not.toBe('')
  const mail = await fetch(`${mailUrl}/api/v1/message/${messageId}`).then(response => response.json())
  const match = mail.HTML.match(/href="([^"]+token_hash=[^"]+)"/)
  expect(match).toBeTruthy()
  const link = match[1].replaceAll('&amp;', '&')
  const fresh = await browser.newContext()
  try {
    const tab = await fresh.newPage()
    await tab.goto(link)
    await expect(tab.getByRole('heading', { name: 'A little about you' })).toBeVisible()
    expect((await admin.from('onboarding_progress').select('return_to').eq('user_id', userId!).single()).data?.return_to).toBe('/blog')
  } finally { await fresh.close() }
})

test('an expired session during saving preserves typed answers in place', async ({ page, context }, info) => {
  const email = `onboarding-expiry-${info.project.name}-${Date.now()}@example.test`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Original Name' } })
  if (created.error || !created.data.user) throw created.error
  userId = created.data.user.id
  await page.goto('/login')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByLabel('Full name')).toHaveValue('Original Name')
  await page.getByLabel('Full name').fill('Keep my typed name')
  await page.getByLabel('Just getting started', { exact: true }).check()
  await page.getByLabel('Student', { exact: true }).check()
  await context.clearCookies()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to save' })).toBeVisible()
  await expect(page.getByLabel('Full name')).toHaveValue('Keep my typed name')
  await expect(page.getByLabel('Student', { exact: true })).toBeChecked()
  await expect(page).toHaveURL(/\/dashboard\/onboarding\?/)
  expect((await admin.from('onboarding_progress').select('revision').eq('user_id', userId).single()).data?.revision).toBe(0)
})
