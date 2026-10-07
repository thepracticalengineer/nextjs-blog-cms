import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'
import { readyArticle } from '../publication-fixture'

test('preserves custom slugs and redirects deliberate published URL changes', async ({ page, request, apiKey }) => {
  page.on('dialog', dialog => dialog.accept())
  const headers = { Authorization: `Bearer ${apiKey}` }
  const slug = `slug-safety-${Date.now()}`
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  await page.goto('/login')
  await page.getByLabel('Email address').fill('e2e-test@playwright.local')
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_TEST_PASSWORD ?? 'E2eTestPassword123!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/dashboard/posts/new')
  await page.getByLabel('Post title').fill(readyArticle.title)
  await page.getByLabel('Post title').blur()
  await expect(page.getByLabel('Slug')).toHaveValue('integration-testing-at-service-boundaries')
  await page.getByLabel('Slug').fill(slug)
  await page.getByLabel('Post title').focus()
  await page.getByLabel('Post title').blur()
  await expect(page.getByLabel('Slug')).toHaveValue(slug)

  await page.getByLabel('Slug').fill('   ')
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
  await expect(page.getByText('Post saved as draft', { exact: true })).toBeVisible()
  const draftId = new URL(page.url()).searchParams.get('draft')!
  try {
    const saved = await request.get(`/api/posts/${draftId}`, { headers })
    expect(saved.status()).toBe(200)
    expect((await saved.json()).data.slug).toMatch(/^integration-testing-at-service-boundaries(?:-\d+)?$/)
  } finally {
    await request.delete(`/api/posts/${draftId}`, { headers })
  }

  const created = await request.post('/api/posts/create', { headers, data: { ...readyArticle, slug, status: 'published', editorial_reviewed: true } })
  expect(created.status()).toBe(201)
  const id = (await created.json()).data.post.id as string
  try {
    await page.goto(`/dashboard/posts/${id}/edit`)
    await expect(page.getByLabel('Slug')).toHaveAttribute('readonly')
    await page.getByLabel('Post title').fill('Updated Integration Testing at Service Boundaries')
    await page.getByLabel('Post title').blur()
    await expect(page.getByLabel('Slug')).toHaveValue(slug)
    await page.getByRole('checkbox', { name: /I have reviewed/ }).check()
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(page.getByText('Published changes saved', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Change published URL' }).click()
    await page.getByLabel('Slug').fill(`${slug}-new`)
    await page.getByRole('checkbox', { name: /Confirm this URL change/ }).check()
    await page.getByRole('checkbox', { name: /I have reviewed/ }).check()
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(page.getByLabel('Slug')).toHaveAttribute('readonly')
    const redirect = await request.get(`/blog/${slug}`, { maxRedirects: 0 })
    expect(redirect.status()).toBe(308)
    expect(redirect.headers().location).toBe(`/blog/${slug}-new`)
    expect((await request.get(`/blog/${slug}`)).status()).toBe(200)
    const conflict = await request.post('/api/posts/create', { headers, data: { title: 'Another draft', slug } })
    expect(conflict.status()).toBe(409)
    expect((await conflict.json()).details.field_errors.slug).toBeDefined()

    expect((await request.patch(`/api/posts/${id}`, { headers, data: { status: 'draft' } })).status()).toBe(200)
    expect((await request.get(`/blog/${slug}`, { maxRedirects: 0 })).status()).toBe(404)
    expect((await request.patch(`/api/posts/${id}`, { headers, data: { status: 'published', editorial_reviewed: true } })).status()).toBe(200)
    expect((await request.get(`/blog/${slug}`, { maxRedirects: 0 })).status()).toBe(308)

    // Reverting to an owned URL resolves aliases directly, without a loop.
    expect((await request.patch(`/api/posts/${id}`, { headers, data: { slug, confirm_slug_change: true, editorial_reviewed: true } })).status()).toBe(200)
    const reverted = await request.get(`/blog/${slug}-new`, { maxRedirects: 0 })
    expect(reverted.status()).toBe(308)
    expect(reverted.headers().location).toBe(`/blog/${slug}`)
    expect((await request.get(`/blog/${slug}`)).status()).toBe(200)
  } finally {
    await admin.from('posts').delete().eq('id', id)
  }
})
