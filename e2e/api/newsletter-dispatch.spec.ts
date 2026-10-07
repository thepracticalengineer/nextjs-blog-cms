import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'
import { readyArticle } from '../publication-fixture'

test('dispatch failure before provider handoff releases real claims and allows republish', async ({ request, apiKey }) => {
  // Skip outside isolated provider-disabled stacks: this test must never send real emails.
  test.skip(!!process.env.RESEND_API_KEY || !process.env.WEBHOOK_SECRET, 'Requires an isolated stack with email delivery disabled and a webhook secret.')
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const headers = { Authorization: `Bearer ${apiKey}` }
  const suffix = Date.now()
  const postIds: string[] = []
  const email = `newsletter-handoff-${suffix}@example.com`
  try {
    for (let index = 0; index < 2; index++) {
      const created = await request.post('/api/posts/create', { headers, data: { ...readyArticle, slug: `newsletter-handoff-${suffix}-${index}`, status: 'published', editorial_reviewed: true } })
      expect(created.status()).toBe(201)
      postIds.push((await created.json()).data.post.id)
    }
    expect((await admin.from('newsletter_subscriptions').insert({ email })).error).toBeNull()
    expect((await admin.from('newsletter_sends').update({ scheduled_at: '2020-01-01T00:00:00Z' }).in('post_id', postIds)).error).toBeNull()

    const response = await request.post('/api/newsletter/send', { headers: { 'x-webhook-secret': process.env.WEBHOOK_SECRET! } })
    expect(response.status()).toBe(500)
    const { data: failed, error } = await admin.from('newsletter_sends').select('id, post_id, status, sending_started_at, delivery_started_at, dispatch_token').in('post_id', postIds)
    expect(error).toBeNull()
    expect(failed).toHaveLength(2)
    for (const send of failed!) expect(send).toMatchObject({ status: 'failed', sending_started_at: null, delivery_started_at: null, dispatch_token: null })

    // Execute the application's republish path; a fresh deadline reuses each row.
    for (const id of postIds) {
      expect((await request.patch(`/api/posts/${id}`, { headers, data: { status: 'draft' } })).status()).toBe(200)
      expect((await request.patch(`/api/posts/${id}`, { headers, data: { status: 'published', editorial_reviewed: true } })).status()).toBe(200)
    }
    const restored = await admin.from('newsletter_sends').select('id, post_id, status, scheduled_at').in('post_id', postIds)
    expect(restored.error).toBeNull()
    for (const send of restored.data!) {
      expect(send).toMatchObject({ id: failed!.find(previous => previous.post_id === send.post_id)!.id, status: 'pending' })
      expect(Date.parse(send.scheduled_at)).toBeGreaterThan(Date.now())
    }
  } finally {
    await admin.from('newsletter_subscriptions').delete().eq('email', email)
    if (postIds.length) await admin.from('posts').delete().in('id', postIds)
  }
})
