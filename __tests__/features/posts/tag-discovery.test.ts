import { describe, expect, it, vi } from 'vitest'

const tags = [
  { slug: 'canonical', created_at: '2026-10-07T00:00:00Z', merged_into: null },
  { slug: 'alias', created_at: '2026-10-07T00:00:00Z', merged_into: 'canonical-id' },
]
const client = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }))
vi.mock('@/lib/supabase/static', () => ({ createStaticClient: () => client }))
vi.mock('@/features/posts/components/PostList', () => ({ PostList: () => null }))

function installTaxonomy() {
  client.from.mockImplementation((table: string) => {
    let rows = table === 'tags' ? tags : []
    const query = {
      select: () => query,
      eq: () => query,
      is: (column: string, value: unknown) => {
        if (column === 'merged_into' && value === null) rows = rows.filter(row => row.merged_into === null)
        return query
      },
      then: (resolve: (result: { data: typeof rows }) => unknown) => Promise.resolve(resolve({ data: rows })),
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
  it('prerenders only canonical tag pages', async () => {
    installTaxonomy()
    const { generateStaticParams } = await import('@/app/(public)/blog/tag/[slug]/page')
    expect(await generateStaticParams()).toEqual([{ slug: 'canonical' }])
  })
})
