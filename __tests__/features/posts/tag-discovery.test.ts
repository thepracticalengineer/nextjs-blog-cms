import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const client = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }))
vi.mock('@/features/posts/components/PostList', () => ({ PostList: () => null }))

function installTaxonomy() {
  client.from.mockImplementation(() => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      range: () => query,
      returns: async () => ({ data: [{
        slug: 'article', updated_at: '2026-10-07T00:00:00Z', category: null, author: null,
        tags: [
          { tag: { slug: 'canonical', merged_into: null } },
          { tag: { slug: 'alias', merged_into: 'canonical-id' } },
        ],
      }] }),
    }
    return query
  })
}

describe('canonical tag discovery', () => {
  it('excludes redirect aliases from the sitemap', async () => {
    installTaxonomy()
    const { default: sitemap } = await import('@/app/sitemap')
    const urls = (await sitemap()).map(entry => entry.url)
    expect(urls.some(url => url.endsWith('/blog/tag/canonical'))).toBe(true)
    expect(urls.some(url => url.endsWith('/blog/tag/alias'))).toBe(false)
  })
  it('renders new taxonomy URLs dynamically after a production build', async () => {
    installTaxonomy()
    const { dynamic } = await import('@/app/(public)/blog/tag/[slug]/page')
    expect(dynamic).toBe('force-dynamic')
  })
})
