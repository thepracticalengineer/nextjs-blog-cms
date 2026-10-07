import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowLocalImageOptimization } from '@/lib/image-config.mjs'
import { isCoverImageAllowed } from '@/lib/cover-images'
import { publicationErrors } from '@/features/posts/publication'
import { validPost } from '../../helpers/publication'

afterEach(() => vi.unstubAllEnvs())
describe('cover image readiness matches the public optimizer allowlist', () => {
  it('permits only the configured loopback storage origin and keeps production IP blocking', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:55321')
    vi.stubEnv('NODE_ENV', 'development')
    expect(isCoverImageAllowed('http://127.0.0.1:55321/storage/v1/object/public/post-media/cover.webp')).toBe(true)
    expect(isCoverImageAllowed('http://127.0.0.1:54321/storage/v1/object/public/post-media/cover.webp')).toBe(false)
    expect(allowLocalImageOptimization()).toBe(true)
    vi.stubEnv('NODE_ENV', 'production')
    expect(allowLocalImageOptimization()).toBe(false)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://untrusted.example')
    expect(isCoverImageAllowed('http://untrusted.example/storage/v1/object/public/cover.webp')).toBe(false)
  })
  it('enforces HTTPS hosts and Supabase public storage paths', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('IMAGE_REMOTE_HOSTS', 'images.example.com, **.cdn.example.com')
    for (const url of ['', '/images/cover.jpg', 'https://images.example.com/cover.jpg', 'https://a.cdn.example.com/cover.jpg', 'https://test.supabase.co/storage/v1/object/public/posts/cover.jpg']) {
      expect(isCoverImageAllowed(url), url).toBe(true)
    }
    for (const url of ['http://images.example.com/cover.jpg', 'https://unknown.example.com/cover.jpg', 'https://test.supabase.co/storage/v1/object/private/cover.jpg', '//images.example.com/cover.jpg', 'javascript:alert(1)', '/\\unknown.example/cover.jpg', 'https://user:password@images.example.com/cover.jpg']) {
      expect(isCoverImageAllowed(url), url).toBe(false)
      expect(publicationErrors({ ...validPost, cover_image: url }, 'Author', true).cover_image).toBeDefined()
    }
  })
})
