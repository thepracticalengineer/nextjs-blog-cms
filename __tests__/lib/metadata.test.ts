import { afterEach, expect, it, vi } from 'vitest'
import { publicPageMetadata } from '@/lib/metadata'

afterEach(() => vi.unstubAllEnvs())
it.each([
  ['1', 'https://example.com/blog'],
  ['2', 'https://example.com/blog?page=2'],
  ['02', 'https://example.com/blog'],
  ['-1', 'https://example.com/blog'],
  ['1000001', 'https://example.com/blog'],
  [['2', '3'], 'https://example.com/blog'],
] as const)('normalizes archive page %s consistently with list rendering', (page, canonical) => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com/some/path?tracking=1#fragment')
  expect(publicPageMetadata('/blog', 'Articles', 'Engineering articles.', { page: typeof page === 'string' ? page : [...page] }).alternates).toEqual({ canonical })
})
it.each(['javascript:alert(1)', 'ftp://example.com', 'https://user:password@example.com'])('rejects unsafe configured origin %s', origin => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin)
  expect(() => publicPageMetadata('/', 'Home', 'Engineering articles.')).toThrow('NEXT_PUBLIC_SITE_URL')
})
it('uses the development origin when no public origin is configured', () => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined)
  expect(publicPageMetadata('/blog', 'Articles', 'Engineering articles.').alternates).toEqual({ canonical: 'http://localhost:3000/blog' })
})
