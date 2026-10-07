import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendNewsletterEmail } from '@/lib/notifications/newsletter'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(function () { return { emails: { send } } }) }))

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'local-test-key')
  vi.stubEnv('RESEND_FROM_EMAIL', 'newsletter@example.com')
  send.mockResolvedValue({ error: null })
})

describe('newsletter cover descriptions', () => {
  it.each([
    [undefined, 'Article &amp; title'],
    [null, 'Article &amp; title'],
    ['', 'Article &amp; title'],
    ['A "circuit" & <labels>', 'A &quot;circuit&quot; &amp; &lt;labels&gt;'],
  ])('escapes the saved alt or title fallback (%s)', async (cover_image_alt, expected) => {
    await sendNewsletterEmail({ id: 'subscriber', email: 'reader@example.com', unsubscribe_token: 'token', subscribed_at: '2026-01-01', unsubscribed_at: null }, {
      title: 'Article & title', slug: 'article', excerpt: null, cover_image: 'https://example.com/cover.webp', cover_image_alt,
    })
    expect(send.mock.lastCall?.[0].html).toContain(`alt="${expected}"`)
  })
})
