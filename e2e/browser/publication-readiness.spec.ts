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
    const newsletter = page.getByRole('region', { name: 'Newsletter notification' })
    await expect(newsletter).toContainText('Publishing will notify active subscribers')
    await expect(newsletter).toContainText('Configured delay:')
    await expect(page.getByText('Publication readiness', { exact: true })).toBeVisible()
    await expect(page.getByRole('checkbox')).not.toBeChecked()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm publication', exact: true }).click()
    await expect(page.locator('#editorial_reviewed-error')).toContainText('human editor')
    expect((await admin().from('posts').select('status').eq('id', id).single()).data?.status).toBe('draft')
    expect((await admin().from('newsletter_sends').select('id').eq('post_id', id)).data).toEqual([])

    // Exercise the editor's serialized JSON format and immediate form sync.
    await page.locator('[contenteditable="true"]').fill(readyArticle.content.replace(/<[^>]+>/g, ' '))
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm publication', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Unpublish', exact: true })).toBeVisible()
    await expect(newsletter).toContainText('Queued')
    await expect(newsletter.getByRole('button', { name: 'Retry newsletter scheduling' })).toHaveCount(0)
    expect((await admin().from('posts').select('status').eq('id', id).single()).data?.status).toBe('published')
    expect((await request.get(`/blog/${slug}`)).status()).toBe(200)
    const storedContent = (await admin().from('posts').select('content').eq('id', id).single()).data?.content
    expect(JSON.parse(storedContent).type).toBe('doc')

    await page.getByLabel('Post title').fill('hello this is for test')
    // A claimed failure before provider handoff can be retried without saving input.
    const queuedSend = (await admin().from('newsletter_sends').select('id').eq('post_id', id).single()).data
    expect((await admin().from('newsletter_sends').update({ status: 'failed', sending_started_at: new Date().toISOString(), dispatch_token: '00000000-0000-4000-8000-000000000086' }).eq('post_id', id)).error).toBeNull()
    await newsletter.getByRole('button', { name: 'Refresh status' }).click()
    await expect(newsletter).toContainText('Failed')
    await newsletter.getByRole('button', { name: 'Retry newsletter scheduling' }).click()
    await expect(newsletter).toContainText('Queued')
    expect((await admin().from('newsletter_sends').select('id, status').eq('post_id', id).single()).data).toEqual({ id: queuedSend?.id, status: 'pending' })
    await expect(page.getByLabel('Post title')).toHaveValue('hello this is for test')
    expect((await admin().from('posts').select('title').eq('id', id).single()).data?.title).toBe(readyArticle.title)
    await expect(page.getByRole('checkbox')).not.toBeChecked()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(page.locator('#title-error')).toContainText('placeholder')
    await expect(page.getByLabel('Post title')).toHaveValue('hello this is for test')
    expect((await admin().from('posts').select('title, status').eq('id', id).single()).data).toEqual({ title: readyArticle.title, status: 'published' })
    await page.screenshot({ path: 'test-results/publication-readiness.png', fullPage: true })

    await page.getByRole('button', { name: 'Unpublish', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible()
    await expect(newsletter).toContainText('Canceled')
    expect((await admin().from('newsletter_sends').select('status').eq('post_id', id).single()).data?.status).toBe('failed')
    expect((await request.get(`/blog/${slug}`)).status()).toBe(404)
    // A withdrawn pending notification must be restored once the corrected article is reviewed.
    const previousSend = (await admin().from('newsletter_sends').select('id').eq('post_id', id).single()).data
    await page.getByLabel('Post title').fill(readyArticle.title)
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm publication', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Unpublish', exact: true })).toBeVisible()
    const restored = await admin().from('newsletter_sends').select('id, status, scheduled_at, sending_started_at').eq('post_id', id).single()
    expect(restored.data).toMatchObject({ id: previousSend?.id, status: 'pending', sending_started_at: null })
    await expect(newsletter).toContainText('Queued')
    expect(Date.parse(restored.data!.scheduled_at)).toBeGreaterThan(Date.now())
    expect((await request.get(`/blog/${slug}`)).status()).toBe(200)
  } finally {
    await admin().from('posts').delete().eq('id', id)
  }
})
