import { loginEditor, publishEditor, unpublishEditor } from '../editor-actions'
import { seedPost } from '../post-fixtures'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'
import { readyArticle } from '../publication-fixture'

test('dispatch failure before provider handoff releases real claims and allows republish', async ({ page, request }) => {
  test.setTimeout(120_000)
  // Skip outside isolated provider-disabled stacks: this test must never send real emails.
  test.skip(!!process.env.RESEND_API_KEY || !process.env.CRON_SECRET, 'Requires an isolated stack with email delivery disabled and a cron secret.')
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  await loginEditor(page)
  const suffix = Date.now()
  const postIds: string[] = []
  const email = `newsletter-handoff-${suffix}@example.com`
  try {
    for (let index = 0; index < 2; index++) {
      const { id } = await seedPost({ ...readyArticle, slug: `newsletter-handoff-${suffix}-${index}` })
      postIds.push(id)
      await page.goto(`/dashboard/posts/${id}/edit`)
      await publishEditor(page)
    }
    expect((await admin.from('newsletter_subscriptions').insert({ email })).error).toBeNull()
    expect((await admin.from('newsletter_sends').update({ scheduled_at: '2020-01-01T00:00:00Z' }).in('post_id', postIds)).error).toBeNull()

    expect((await request.get('/api/newsletter/send')).status()).toBe(401)
    const response = await request.get('/api/newsletter/send', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET!}` } })
    expect(response.status()).toBe(500)
    const { data: failed, error } = await admin.from('newsletter_sends').select('id, post_id, status, sending_started_at, delivery_started_at, dispatch_token').in('post_id', postIds)
    expect(error).toBeNull()
    expect(failed).toHaveLength(2)
    for (const send of failed!) expect(send).toMatchObject({ status: 'failed', sending_started_at: null, delivery_started_at: null, dispatch_token: null })

    // Execute the application's republish path; a fresh deadline reuses each row.
    for (const id of postIds) {
      await page.goto(`/dashboard/posts/${id}/edit`)
      await unpublishEditor(page)
      await publishEditor(page)
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
