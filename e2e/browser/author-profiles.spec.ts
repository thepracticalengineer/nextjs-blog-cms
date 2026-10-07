import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const ids: string[] = []
const marker = `authors-${Date.now()}`

test.beforeAll(async () => {
  const client = admin()
  for (let index = 0; index < 3; index++) {
    const { data, error } = await client.auth.admin.createUser({
      email: `${marker}-${index}@playwright.local`, password: 'AuthorTestPassword123!', email_confirm: true,
    })
    if (error || !data.user) throw error ?? new Error('Could not create author fixture')
    ids.push(data.user.id)
    const { error: profileError } = await client.from('profiles').update({
      full_name: 'Same Name', bio: index === 0 ? 'Public biography' : null,
      website: index === 0 ? 'https://example.com' : null,
    }).eq('id', data.user.id)
    if (profileError) throw profileError
  }
  const posts = Array.from({ length: 13 }, (_, index) => ({
    author_id: ids[0], title: `${marker} article ${index}`, slug: `${marker}-${index}`,
    excerpt: `Public excerpt ${index}`, status: 'published',
    published_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  }))
  const { error } = await client.from('posts').insert([
    ...posts,
    { author_id: ids[0], title: `${marker} private draft`, slug: `${marker}-draft`, status: 'draft' },
    { author_id: ids[1], title: `${marker} other author`, slug: `${marker}-other`, status: 'published' },
  ])
  if (error) throw error
})

test.afterAll(async () => {
  for (const id of ids) {
    await admin().from('posts').delete().eq('author_id', id)
    await admin().auth.admin.deleteUser(id)
  }
})

test('anonymous reader follows byline and browses only this author’s published posts', async ({ page, request }) => {
  await page.goto(`/blog/${marker}-12`)
  const byline = page.getByRole('link', { name: 'Same Name', exact: true })
  await byline.focus()
  await expect(byline).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/authors/${ids[0]}$`))
  await expect(page.getByRole('heading', { name: 'Same Name', exact: true })).toBeVisible()
  await expect(page.getByText('Public biography', { exact: true })).toBeVisible()
  await expect(page.getByText('13 articles', { exact: true })).toBeVisible()
  const titles = page.getByRole('region', { name: 'Published articles', exact: true }).locator('h2').filter({ hasNotText: 'Published articles' })
  await expect(titles).toHaveCount(12)
  await expect(titles.first()).toHaveText(`${marker} article 12`)
  await expect(page.getByText(`${marker} private draft`, { exact: true })).toHaveCount(0)
  await expect(page.getByText(`${marker} other author`, { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Next →', exact: true }).click()
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: `${marker} article 0`, exact: true })).toBeVisible()
  await page.getByRole('link', { name: `${marker} article 0`, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/blog/${marker}-0$`))

  const html = await (await request.get(`/authors/${ids[0]}`)).text()
  expect(html).not.toContain(`${marker}-0@playwright.local`)
  expect(html).not.toContain(`${marker} private draft`)
  const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { data: profiles, error } = await anonymous.from('profiles').select('*')
  expect(error).toBeNull()
  expect(profiles).toEqual([])
  const { data: author, error: authorError } = await anonymous.from('public_author_profiles').select('*').eq('id', ids[0]).single()
  expect(authorError).toBeNull()
  expect(author).not.toHaveProperty('email')
  expect(author).not.toHaveProperty('role')
})

test('duplicate names, empty profiles, invalid URLs and mobile layout', async ({ page }) => {
  await page.goto(`/authors/${ids[1]}`)
  await expect(page.getByRole('heading', { name: `${marker} other author`, exact: true })).toBeVisible()
  await expect(page.getByText('1 article', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/authors/${ids[0]}`)
  await expect(page.getByRole('heading', { name: 'Same Name', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.goto(`/authors/${ids[2]}`)
  await expect(page.getByText('No published articles yet.', { exact: true })).toBeVisible()
  const response = await page.goto('/authors/00000000-0000-0000-0000-000000000000')
  expect(response?.status()).toBe(404)
})
