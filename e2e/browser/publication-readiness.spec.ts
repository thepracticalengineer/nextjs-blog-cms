import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'
import { readyArticle } from '../publication-fixture'

// The global environment guard runs before these non-production fixtures exist.
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

test('author reviews, publishes, corrects a rejected live edit and unpublishes safely', async ({ page, request, apiKey }) => {
  const headers = { Authorization: `Bearer ${apiKey}` }
  const slug = `publication-readiness-${Date.now()}`
  const created = await request.post('/api/posts/create', { headers, data: { ...readyArticle, slug, status: 'draft' } })
  expect(created.status()).toBe(201)
  const id = (await created.json()).data.post.id as string
  try {
    await page.goto('/login')
    await page.getByLabel('Email address').fill('e2e-test@playwright.local')
    await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_TEST_PASSWORD ?? 'E2eTestPassword123!')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goto(`/dashboard/posts/${id}/edit`)
    await expect(page.getByText('Publication readiness', { exact: true })).toBeVisible()
    await expect(page.getByRole('checkbox')).not.toBeChecked()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.locator('#editorial_reviewed-error')).toContainText('human editor')
    expect((await admin().from('posts').select('status').eq('id', id).single()).data?.status).toBe('draft')
    expect((await admin().from('newsletter_sends').select('id').eq('post_id', id)).data).toEqual([])

    // Exercise the editor's serialized JSON format and immediate form sync.
    await page.locator('[contenteditable="true"]').fill(readyArticle.content.replace(/<[^>]+>/g, ' '))
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Unpublish', exact: true })).toBeVisible()
    expect((await admin().from('posts').select('status').eq('id', id).single()).data?.status).toBe('published')
    expect((await request.get(`/blog/${slug}`)).status()).toBe(200)
    const storedContent = (await admin().from('posts').select('content').eq('id', id).single()).data?.content
    expect(JSON.parse(storedContent).type).toBe('doc')

    await page.getByLabel('Post title').fill('hello this is for test')
    await expect(page.getByRole('checkbox')).not.toBeChecked()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(page.locator('#title-error')).toContainText('placeholder')
    await expect(page.getByLabel('Post title')).toHaveValue('hello this is for test')
    expect((await admin().from('posts').select('title, status').eq('id', id).single()).data).toEqual({ title: readyArticle.title, status: 'published' })
    await page.screenshot({ path: 'test-results/publication-readiness.png', fullPage: true })

    await page.getByRole('button', { name: 'Unpublish', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible()
    expect((await admin().from('newsletter_sends').select('status').eq('post_id', id).single()).data?.status).toBe('failed')
    expect((await request.get(`/blog/${slug}`)).status()).toBe(404)
  } finally {
    await admin().from('posts').delete().eq('id', id)
  }
})
