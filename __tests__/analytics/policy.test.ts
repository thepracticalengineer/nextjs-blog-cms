import { describe, expect, it } from 'vitest'
import { analyticsConfig, publicLocation, publicReferrer } from '@/lib/analytics/policy'

const config = { measurementId: 'G-TEST123', origin: 'https://www.thepracticalengineer.online' }
const env = { NODE_ENV: 'production', VERCEL_ENV: 'production', GA_ENABLED: 'true', NEXT_PUBLIC_SITE_URL: config.origin, NEXT_PUBLIC_GA_MEASUREMENT_ID: config.measurementId }

describe('analytics production gate', () => {
  it('requires production, explicit rollout approval, a valid ID, and a canonical HTTPS origin', () => {
    expect(analyticsConfig(env)).toEqual(config)
    for (const change of [
      { NODE_ENV: 'development' }, { GA_ENABLED: undefined }, { VERCEL_ENV: 'preview' },
      { NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-abc<script>' }, { NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' },
      { NEXT_PUBLIC_SITE_URL: 'https://test.vercel.app' }, { NEXT_PUBLIC_SITE_URL: config.origin + '/blog' },
      { NEXT_PUBLIC_SITE_URL: 'not a url' }, { NEXT_PUBLIC_SITE_URL: 'https://user:pass@example.com' },
      { VERCEL_ENV: undefined, DEPLOYMENT_ENV: undefined },
    ]) expect(analyticsConfig({ ...env, ...change })).toBeNull()
    expect(analyticsConfig({ ...env, VERCEL_ENV: undefined, DEPLOYMENT_ENV: 'production' })).toEqual(config)
    expect(analyticsConfig({ ...env, VERCEL_ENV: 'preview', DEPLOYMENT_ENV: 'production' })).toBeNull()
  })
})

describe('analytics data minimization', () => {
  it('allows only approved public URLs and campaign vocabulary; omits free-text search', () => {
    expect(publicLocation(config.origin + '/blog?q=reader%40example.com&page=2&utm_source=newsletter', config))
      .toBe(config.origin + '/blog?page=2&utm_source=newsletter')
    expect(publicLocation(config.origin + '/blog/category/architecture', config)).toBe(config.origin + '/blog/category/architecture')
  })
  it.each([
    '/dashboard', '/dashboard/posts/private/edit', '/login', '/reset-password', '/auth/callback',
    '/newsletter/unsubscribed', '/authors/123', '/blog/private/preview', '/?code=secret',
    '/blog?token=secret', '/blog?next=/dashboard', '/blog#access_token=secret',
    '/blog?utm_source=reader%40example.com', '/blog?email=reader%40example.com',
    '/blog/user%40example.com', '/blog?page=invalid',
  ])('excludes %s', path => expect(publicLocation(config.origin + path, config)).toBeNull())
  it('rejects preview origins and minimizes external referrers', () => {
    expect(publicLocation('https://preview.vercel.app/blog', config)).toBeNull()
    expect(publicReferrer(config.origin + '/reset-password?token=secret', config)).toBe('')
    expect(publicReferrer('https://www.google.com/search?q=private#secret', config)).toBe('https://www.google.com/')
    expect(publicReferrer('javascript:alert(1)', config)).toBe('')
  })
})
