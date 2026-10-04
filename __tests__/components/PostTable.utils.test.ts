import { describe, it, expect } from 'vitest'
import { filterAndSort, buildPageNumbers, getCategories } from '@/components/dashboard/PostTable/utils'
import type { PostWithRelations } from '@/features/posts/types'

function makePost(overrides: Partial<PostWithRelations> = {}): PostWithRelations {
  return {
    id: 'p1',
    title: 'Test Post',
    slug: 'test-post',
    content: null,
    excerpt: null,
    status: 'draft',
    author_id: 'u1',
    category_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    author: { id: 'u1', full_name: 'Alice', email: 'alice@example.com', avatar_url: null },
    category: null,
    tags: [],
    ...overrides,
  } as PostWithRelations
}

const posts: PostWithRelations[] = [
  makePost({ id: 'p1', title: 'Alpha Post', status: 'published', updated_at: '2024-03-01T00:00:00Z', author: { id: 'u1', full_name: 'Alice', email: 'alice@example.com', avatar_url: null }, category: { id: 'c1', name: 'Tech', slug: 'tech' }, tags: [] }),
  makePost({ id: 'p2', title: 'Beta Post', status: 'draft', updated_at: '2024-01-15T00:00:00Z', author: { id: 'u2', full_name: 'Bob', email: 'bob@example.com', avatar_url: null }, category: { id: 'c2', name: 'News', slug: 'news' }, tags: [] }),
  makePost({ id: 'p3', title: 'Gamma Post', status: 'draft', updated_at: null, author: null, category: null, tags: [] }),
]

describe('filterAndSort', () => {
  it('returns all posts when search is empty and no category filter', () => {
    const result = filterAndSort(posts, '', null, 'title', 'asc')
    expect(result).toHaveLength(3)
  })

  it('filters by search (case-insensitive)', () => {
    const result = filterAndSort(posts, 'alpha', null, 'title', 'asc')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p1')
  })

  it('returns empty array for non-matching search', () => {
    const result = filterAndSort(posts, 'zzznomatch', null, 'title', 'asc')
    expect(result).toHaveLength(0)
  })

  it('filters by category', () => {
    const result = filterAndSort(posts, '', 'c1', 'title', 'asc')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p1')
  })

  it('returns empty when category filter matches nothing', () => {
    const result = filterAndSort(posts, '', 'c99', 'title', 'asc')
    expect(result).toHaveLength(0)
  })

  it('sorts by title asc', () => {
    const result = filterAndSort(posts, '', null, 'title', 'asc')
    expect(result.map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
  })

  it('sorts by title desc', () => {
    const result = filterAndSort(posts, '', null, 'title', 'desc')
    expect(result.map(p => p.id)).toEqual(['p3', 'p2', 'p1'])
  })

  it('sorts by status asc', () => {
    const result = filterAndSort(posts, '', null, 'status', 'asc')
    expect(result[0].status).toBe('draft')
    expect(result[result.length - 1].status).toBe('published')
  })

  it('sorts by updated_at desc (null treated as empty string, sorts last)', () => {
    const result = filterAndSort(posts, '', null, 'updated_at', 'desc')
    expect(result[0].id).toBe('p1')
    expect(result[1].id).toBe('p2')
    expect(result[2].id).toBe('p3')
  })

  it('sorts by author name', () => {
    const result = filterAndSort(posts, '', null, 'author', 'asc')
    expect(result[0].id).toBe('p3') // null author → ''
    expect(result[1].id).toBe('p1') // Alice
    expect(result[2].id).toBe('p2') // Bob
  })
})

describe('buildPageNumbers', () => {
  it('returns all pages when totalPages <= 5', () => {
    expect(buildPageNumbers(3, 2)).toEqual([1, 2, 3])
    expect(buildPageNumbers(1, 1)).toEqual([1])
  })

  it('inserts ellipsis when pages are skipped', () => {
    const pages = buildPageNumbers(10, 5)
    expect(pages).toContain('...')
  })

  it('always includes first and last page', () => {
    const pages = buildPageNumbers(10, 5)
    expect(pages[0]).toBe(1)
    expect(pages[pages.length - 1]).toBe(10)
  })

  it('includes current page and neighbors', () => {
    const pages = buildPageNumbers(10, 5)
    expect(pages).toContain(4)
    expect(pages).toContain(5)
    expect(pages).toContain(6)
  })

  it('no ellipsis for adjacent pages near start', () => {
    const pages = buildPageNumbers(4, 2)
    expect(pages).not.toContain('...')
  })
})

describe('getCategories', () => {
  it('extracts unique categories from posts', () => {
    const cats = getCategories(posts)
    expect(cats).toHaveLength(2)
    expect(cats.map(c => c.id)).toContain('c1')
    expect(cats.map(c => c.id)).toContain('c2')
  })

  it('ignores posts with no category', () => {
    const cats = getCategories([makePost({ category: null })])
    expect(cats).toHaveLength(0)
  })

  it('deduplicates categories', () => {
    const sameCat = { id: 'c1', name: 'Tech', slug: 'tech' }
    const dups = [
      makePost({ id: 'x1', category: sameCat }),
      makePost({ id: 'x2', category: sameCat }),
    ]
    const cats = getCategories(dups)
    expect(cats).toHaveLength(1)
  })
})
