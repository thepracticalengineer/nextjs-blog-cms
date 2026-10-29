// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import sitemap from '@/app/sitemap'

const state = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => createSupabaseClient('http://127.0.0.1:54321', 'test-anon', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: state.fetch } }) }))
const post = (i: number) => ({ id: String(i), slug: `post-${i}`, updated_at: '2026-10-01T00:00:00Z',
  category: { id: 'used-category', slug: 'engineering', updated_at: '2026-09-01T00:00:00Z' },
  tags: [{ tag: { id: 'used-tag', slug: 'systems', created_at: '2026-09-01T00:00:00Z', merged_into: null } }, { tag: { id: 'alias', slug: 'old-tag', merged_into: 'used-tag' } }],
  author: { id: 'public-author' },
})
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.example.com/')
  state.fetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (!url.pathname.endsWith('/posts')) return Response.json([])
    if (url.searchParams.get('status') !== 'eq.published') return Response.json([{ ...post(0), slug: 'private-draft' }])
    const offset = Number(url.searchParams.get('offset') || 0)
    const limit = Number(url.searchParams.get('limit') || 1000)
    return Response.json(Array.from({ length: 1005 }, (_, i) => post(i)).slice(offset, offset + limit))
  })
})
afterEach(() => vi.unstubAllEnvs())
it('includes all published URLs beyond the API row cap and only their public relationships', async () => {
  const entries = await sitemap()
  const urls = entries.map(entry => entry.url)
  expect(urls).toContain('https://www.example.com/blog/post-1004')
  expect(urls.filter(url => /\/blog\/post-/.test(url))).toHaveLength(1005)
  expect(urls).not.toContain('https://www.example.com/blog/private-draft')
  expect(urls).toContain('https://www.example.com/blog/category/engineering')
  expect(urls).toContain('https://www.example.com/blog/tag/systems')
  expect(urls).toContain('https://www.example.com/authors/public-author')
  expect(urls.some(url => url.includes('old-tag'))).toBe(false)
  expect(new Set(urls).size).toBe(urls.length)
  expect(urls).toContain('https://www.example.com')
})
it('does not report an incomplete sitemap as success on a later database failure', async () => {
  state.fetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    return Number(url.searchParams.get('offset')) > 0
      ? Response.json({ message: 'database unavailable' }, { status: 500 })
      : Response.json(Array.from({ length: 500 }, (_, i) => post(i)))
  })
  await expect(sitemap()).rejects.toMatchObject({ message: 'database unavailable' })
})
it('does not include empty taxonomy or author archives when there are no published posts', async () => {
  state.fetch.mockImplementation(async () => Response.json([]))
  expect((await sitemap()).map(entry => entry.url)).toEqual(['https://www.example.com', 'https://www.example.com/blog'])
})
it('includes only current published page URLs across every batch with publication timestamps', async () => {
  state.fetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (!url.pathname.endsWith('/page_snapshots')) return Response.json([])
    expect(url.searchParams.get('select')).toBe('page_id,slug,published_at')
    const offset = Number(url.searchParams.get('offset') || 0)
    const limit = Number(url.searchParams.get('limit'))
    const rows = Array.from({ length: 1005 }, (_, i) => ({ page_id: String(i), slug: `page-${i}`, published_at: '2026-10-29T00:00:00Z' }))
    return Response.json([...rows, { page_id: 'reserved', slug: 'blog', published_at: '2026-10-29T00:00:00Z' }].slice(offset, offset + limit))
  })
  const entries = await sitemap()
  expect(entries.filter(entry => entry.url.includes('/page-'))).toHaveLength(1005)
  expect(entries.find(entry => entry.url.endsWith('/page-1004'))?.lastModified).toEqual(new Date('2026-10-29T00:00:00Z'))
  expect(entries.find(entry => entry.url.endsWith('/blog'))?.priority).toBe(0.9)
})
it('fails instead of serving a partial sitemap when snapshot reads fail', async () => {
  state.fetch.mockImplementation(async (input: RequestInfo | URL) => new URL(String(input)).pathname.endsWith('/page_snapshots') ? Response.json({ message: 'snapshot outage' }, { status: 500 }) : Response.json([]))
  await expect(sitemap()).rejects.toMatchObject({ message: 'snapshot outage' })
})
