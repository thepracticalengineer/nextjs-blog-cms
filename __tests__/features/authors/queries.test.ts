import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { getAuthorPublishedPosts, getPublicAuthor, parseAuthorPage } from '@/features/authors/queries'
import { POST_SELECT } from '@/features/posts/queries'

const id = 'bc565d83-86ca-49b0-b23f-90db6c099567'
const mockCreateClient = vi.mocked(createClient)

function mockQuery(result: { data?: unknown; count?: number | null; error?: unknown }) {
  const chain = {
    select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), order: vi.fn(), range: vi.fn(),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  for (const method of ['select', 'eq', 'maybeSingle', 'order', 'range'] as const) {
    chain[method].mockReturnValue(chain)
  }
  const from = vi.fn().mockReturnValue(chain)
  mockCreateClient.mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>)
  return { chain, from }
}

beforeEach(() => vi.resetAllMocks())

describe('public author lookup', () => {
  it.each(['Frank', '', '../private', 'not-a-uuid'])('rejects invalid identifier %s before querying', async (value) => {
    expect(await getPublicAuthor(value)).toBeNull()
    expect(await getAuthorPublishedPosts(value)).toEqual({ posts: [], total: 0 })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('looks up a stable UUID through the public view using only public fields', async () => {
    const author = { id, full_name: 'Frank', bio: 'Writer', avatar_url: null }
    const { chain, from } = mockQuery({ data: author, error: null })
    expect(await getPublicAuthor(id)).toEqual(author)
    expect(from).toHaveBeenCalledWith('public_author_profiles')
    expect(chain.eq).toHaveBeenCalledWith('id', id)
    expect(chain.maybeSingle).toHaveBeenCalledOnce()
    const fields = chain.select.mock.calls[0][0].split(',').map((field: string) => field.trim())
    expect(fields).toEqual(['id', 'full_name', 'avatar_url', 'bio', 'website', 'twitter_url', 'linkedin_url', 'github_url', 'instagram_url', 'facebook_url', 'youtube_url', 'tiktok_url'])
    expect(fields).not.toContain('email')
    expect(fields).not.toContain('role')
    expect(fields).not.toContain('*')
  })

  it('returns null for an unknown UUID', async () => {
    mockQuery({ data: null, error: null })
    expect(await getPublicAuthor(id)).toBeNull()
  })

  it('preserves database errors instead of reporting an unknown author', async () => {
    const error = new Error('Database unavailable')
    mockQuery({ data: null, error })
    await expect(getPublicAuthor(id)).rejects.toThrow(error)
  })
})

describe('author published articles', () => {
  it('filters by author and published status, orders ties consistently, paginates and normalizes tags', async () => {
    const tag = { id: 'tag-1', name: 'Engineering', slug: 'engineering' }
    const { chain, from } = mockQuery({ data: [{ id: 'post-1', tags: [{ tag }, { tag: null }] }], count: 30, error: null })
    expect(await getAuthorPublishedPosts(id, 2, 12)).toEqual({ posts: [{ id: 'post-1', tags: [tag] }], total: 30 })
    expect(from).toHaveBeenCalledWith('posts')
    expect(chain.select).toHaveBeenCalledWith(POST_SELECT, { count: 'exact' })
    expect(chain.eq.mock.calls).toEqual([['author_id', id], ['status', 'published']])
    expect(chain.order.mock.calls).toEqual([
      ['published_at', { ascending: false, nullsFirst: false }], ['id', { ascending: false }],
    ])
    expect(chain.range).toHaveBeenCalledWith(12, 23)
    expect(POST_SELECT).toContain('author:public_author_profiles')
    expect(POST_SELECT).not.toMatch(/\b(email|role|confirmed_at|auth_metadata)\b/)
    expect(POST_SELECT).toContain('(id, full_name, avatar_url)')
  })

  it.each([[], null])('returns an empty list and zero when no posts/count exist %#', async (data) => {
    mockQuery({ data, count: null, error: null })
    expect(await getAuthorPublishedPosts(id)).toEqual({ posts: [], total: 0 })
  })

  it('normalizes missing tags', async () => {
    mockQuery({ data: [{ id: 'post-1' }], count: 1, error: null })
    expect(await getAuthorPublishedPosts(id)).toEqual({ posts: [{ id: 'post-1', tags: [] }], total: 1 })
  })

  it('throws database errors', async () => {
    const error = new Error('Query failed')
    mockQuery({ data: null, error })
    await expect(getAuthorPublishedPosts(id)).rejects.toThrow(error)
  })

  it.each([0, -1, 101, 1.5, Number.NaN])('uses the bounded default limit for %s', async (limit) => {
    const { chain } = mockQuery({ data: [], count: 0, error: null })
    await getAuthorPublishedPosts(id, 2, limit)
    expect(chain.range).toHaveBeenCalledWith(12, 23)
  })

  it.each([0, -1, 1.5, 1_000_001, Number.NaN])('uses first page for invalid numeric page %s', async (page) => {
    const { chain } = mockQuery({ data: [], count: 0, error: null })
    await getAuthorPublishedPosts(id, page)
    expect(chain.range).toHaveBeenCalledWith(0, 11)
  })
})

describe('author page parameter', () => {
  it.each([undefined, [], ['2'], '', '0', '-1', '1.5', '01', '1e2', ' 2 ', '1000001', '9007199254740993'])('falls back to first page for invalid input %#', (value) => {
    expect(parseAuthorPage(value)).toBe(1)
  })
  it.each([['1', 1], ['2', 2], ['1000000', 1_000_000]] as const)('parses %s', (value, expected) => {
    expect(parseAuthorPage(value)).toBe(expected)
  })
})
