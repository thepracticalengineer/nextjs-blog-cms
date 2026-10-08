import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { assertDedicatedTestProject } from '../environment'

const fixtureId = randomUUID()
const email = `taxonomy-${fixtureId}@playwright.local`
const password = process.env.E2E_TEST_PASSWORD ?? 'E2eTestPassword123!'
const prefix = `E2E taxonomy ${fixtureId.slice(0, 8)} `
const longName = `${prefix}${'LongName'.repeat(9)}`
let tagIds: string[] = []
let userId: string
let postId: string
const admin = () => {
  assertDedicatedTestProject(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.E2E_SUPABASE_PROJECT_REF)
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

test.beforeAll(async () => {
  const client = admin()
  const { data: account, error: accountError } = await client.auth.admin.createUser({ email, password, email_confirm: true })
  if (accountError) throw accountError
  userId = account.user.id
  const { data: post, error: postError } = await client.from('posts').insert({ author_id: userId, title: 'Taxonomy fixture', slug: `taxonomy-${fixtureId}`, status: 'draft' }).select('id').single()
  if (postError) throw postError
  postId = post.id
  const { error: roleError } = await client.from('profiles').update({ role: 'admin' }).eq('id', userId)
  if (roleError) throw roleError
  const fixtures = Array.from({ length: 55 }, (_, i) => ({ name: `${prefix}${i}`, slug: `e2e-taxonomy-${fixtureId}-${i}` }))
  fixtures.push({ name: longName, slug: `e2e-taxonomy-${fixtureId}-long` }, { name: `${prefix}duplicate`, slug: `e2e-taxonomy-${fixtureId}-duplicate` })
  const { data, error } = await client.from('tags').insert(fixtures).select('id')
  if (error) throw error
  tagIds = data.map(tag => tag.id)
})

test.afterAll(async () => {
  const client = admin()
  try {
    if (tagIds.length) {
      const { error: relationshipError } = await client.from('post_tags').delete().in('tag_id', tagIds)
      if (relationshipError) throw relationshipError
      const { error: aliasError } = await client.from('tags').update({ merged_into: null }).in('id', tagIds)
      if (aliasError) throw aliasError
      const { error } = await client.from('tags').delete().in('id', tagIds)
      if (error) throw error
    }
  } finally {
    if (userId) {
      await client.from('posts').delete().eq('author_id', userId)
      const { error } = await client.auth.admin.deleteUser(userId)
      if (error) throw error
    }
  }
})

test('search, keyboard selection, mobile wrapping, saved relationships and merge redirects', async ({ page, request }) => {
  await page.goto('/login')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto(`/dashboard/posts/${postId}/edit`)
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await page.getByLabel('Search tags').fill(longName)
  const tag = page.getByRole('button', { name: longName, exact: true })
  await tag.focus()
  await page.keyboard.press('Space')
  const removal = page.getByRole('button', { name: `Remove tag ${longName}` })
  await expect(removal).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Search tags').fill('missing-tag-name')
  await expect(removal).toBeVisible()
  await expect(page.getByText('No matching unselected tags.')).toBeVisible()
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(removal).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await removal.focus()
  await page.keyboard.press('Enter')
  await expect(removal).toHaveCount(0)
  await page.getByLabel('Search tags').fill(`${prefix}duplicate`)
  await page.getByRole('button', { name: `${prefix}duplicate`, exact: true }).click()
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
  await expect(page.getByText('Post saved as draft', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: `Remove tag ${prefix}duplicate` })).toBeVisible()
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('link', { name: /Manage tags/ }).click()
  const management = await popupPromise
  await management.getByLabel('Tag to merge', { exact: true }).selectOption({ label: `${prefix}duplicate` })
  await management.getByLabel('Keep this tag and URL').selectOption(tagIds[0])
  await management.getByRole('checkbox').check()
  await management.getByRole('button', { name: 'Merge tags', exact: true }).click()
  await expect(management.getByText('Tags merged. Relationships and old URLs preserved.')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/dashboard/posts/${postId}/edit`))
  const { data } = await admin().from('post_tags').select('tag_id').eq('post_id', postId)
  expect(data?.map(row => row.tag_id)).toContain(tagIds[0])
  expect(data?.map(row => row.tag_id)).not.toContain(tagIds.at(-1))
  const response = await request.get(`/blog/tag/e2e-taxonomy-${fixtureId}-duplicate`, { maxRedirects: 0 })
  expect(response.status()).toBe(308)
  expect(response.headers().location).toBe(`/blog/tag/e2e-taxonomy-${fixtureId}-0`)
  const sitemap = await request.get('/sitemap.xml')
  expect(await sitemap.text()).toContain(`/blog/tag/e2e-taxonomy-${fixtureId}-0`)
  expect(await sitemap.text()).not.toContain(`/blog/tag/e2e-taxonomy-${fixtureId}-duplicate`)
  await management.close()
})
