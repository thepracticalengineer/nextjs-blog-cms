import { describe, expect, it } from 'vitest'
import { normalizePagePath, isPageSlug } from '@/features/pages/urls'
import { pageValuesSchema } from '@/features/pages/schema'

describe('flat public page URLs', () => {
  it.each(['blog', 'dashboard', 'authors', 'api', 'auth', 'login', 'register', 'mfa', 'forgot-password', 'reset-password', 'confirm-email', 'onboarding-unavailable', 'newsletter', 'screenshots', '_next', '.well-known', 'robots.txt', 'sitemap.xml', 'favicon.ico'])('reserves %s', slug => {
    expect(isPageSlug(slug)).toBe(false)
    expect(normalizePagePath(slug)).toBeNull()
    expect(pageValuesSchema.shape.slug.safeParse(slug).success).toBe(false)
  })
  it('normalizes case without accepting paths, escaped separators or whitespace', () => {
    expect(normalizePagePath('About-Us')).toBe('about-us')
    expect(normalizePagePath('BLOG')).toBeNull()
    for (const value of ['about/us', 'about%2fus', 'about%252fus', '//about', ' about ', 'about\\us', 'about--us', 'é', '']) expect(normalizePagePath(value)).toBeNull()
    expect(isPageSlug('About')).toBe(false)
    expect(isPageSlug('contact')).toBe(true)
  })
})
