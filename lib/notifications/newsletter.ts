import { Resend } from 'resend'
import type { NewsletterSubscription } from '@/features/newsletter/types'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeSubject(str: string): string {
  // Strip CR, LF, and other control characters to prevent header injection
  return str.replace(/[\r\n\x00-\x1F\x7F]/g, '')
}

export interface PostEmailData {
  title: string
  slug: string
  excerpt: string | null
  cover_image: string | null
  cover_image_alt?: string | null
}

export async function sendNewsletterEmail(
  subscriber: NewsletterSubscription,
  post: PostEmailData
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured')
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL is not configured')

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const resend = new Resend(apiKey)

  const postUrl = `${siteUrl}/blog/${post.slug}`
  const unsubscribeUrl = `${siteUrl}/api/newsletter/unsubscribe?token=${subscriber.unsubscribe_token}`
  const title = escapeHtml(post.title)
  const excerpt = post.excerpt ? escapeHtml(post.excerpt) : ''

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: subscriber.email,
    subject: sanitizeSubject(`New post: ${post.title}`),
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px;">${title}</h1>
        ${excerpt ? `<p style="color:#6b7280;margin-bottom:16px;">${excerpt}</p>` : ''}
        ${post.cover_image ? `<img src="${escapeHtml(post.cover_image)}" alt="${escapeHtml(post.cover_image_alt || post.title)}" style="width:100%;border-radius:8px;margin-bottom:16px;" />` : ''}
        <a href="${escapeHtml(postUrl)}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Read Post</a>
        <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;" />
        <p style="color:#9ca3af;font-size:12px;">
          You're receiving this because you subscribed to new posts.
          <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9ca3af;">Unsubscribe</a>
        </p>
      </div>
    `,
  })
  if (error) throw new Error(`Newsletter delivery failed: ${error.message}`)
}
