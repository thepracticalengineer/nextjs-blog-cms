import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCoverImageAllowed } from '@/lib/cover-images'
import { publicationErrors } from '@/features/posts/publication'
import { validPost } from '../../helpers/publication'

afterEach(() => vi.unstubAllEnvs())
describe('cover image readiness matches the public optimizer allowlist', () => {
  it('enforces HTTPS hosts and Supabase public storage paths', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('IMAGE_REMOTE_HOSTS', 'images.example.com, **.cdn.example.com')
    for (const url of ['', '/images/cover.jpg', 'https://images.example.com/cover.jpg', 'https://a.cdn.example.com/cover.jpg', 'https://test.supabase.co/storage/v1/object/public/posts/cover.jpg']) {
      expect(isCoverImageAllowed(url), url).toBe(true)
    }
    for (const url of ['http://images.example.com/cover.jpg', 'https://unknown.example.com/cover.jpg', 'https://test.supabase.co/storage/v1/object/private/cover.jpg', '//images.example.com/cover.jpg', 'javascript:alert(1)']) {
      expect(isCoverImageAllowed(url), url).toBe(false)
      expect(publicationErrors({ ...validPost, cover_image: url }, 'Author', true).cover_image).toBeDefined()
    }
  })
})
