import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { generateMetadata as articleMetadata } from '@/app/(public)/blog/[slug]/page'
import { generateMetadata as categoryMetadata } from '@/app/(public)/blog/category/[slug]/page'
import { generateMetadata as tagMetadata } from '@/app/(public)/blog/tag/[slug]/page'
import { getPostBySlug, getPublishedPosts } from '@/features/posts/queries'

vi.mock('@/features/posts/queries', () => ({ getPostBySlug: vi.fn(), getPostRedirect: vi.fn(), getPublishedPosts: vi.fn() }))
const db = vi.hoisted(() => ({ row: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: db.row }) }), is: () => ({ eq: () => ({ single: async () => ({ data: { slug: 'canonical' } }) }) }) }) }) }) }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') }, permanentRedirect: (url: string) => { throw new Error(`REDIRECT:${url}`) } }))

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.example.com/')
  vi.mocked(getPostBySlug).mockResolvedValue({ slug: 'real-slug', title: 'Article title', seo_title: null, seo_description: null, excerpt: 'Useful description', cover_image: null, author: null, published_at: null } as never)
  vi.mocked(getPublishedPosts).mockResolvedValue({ posts: [], total: 25 })
  db.row = { name: 'Engineering', slug: 'engineering', description: 'Engineering guides', merged_into: null }
})
afterEach(() => vi.unstubAllEnvs())

it('canonicalizes articles to their stored slug and supplies a local social fallback', async () => {
  const meta = await articleMetadata({ params: Promise.resolve({ slug: 'requested-slug' }) })
  expect(meta.alternates).toEqual({ canonical: 'https://www.example.com/blog/real-slug' })
  expect(meta.openGraph).toMatchObject({ url: 'https://www.example.com/blog/real-slug', type: 'article', images: [{ url: 'https://www.example.com/logo.png', width: 512, height: 512, alt: 'The Practical Engineer' }] })
  expect(meta.twitter).toMatchObject({ card: 'summary', images: ['https://www.example.com/logo.png'] })
})
it('retains article editorial metadata and cover previews', async () => {
  vi.mocked(getPostBySlug).mockResolvedValue({ slug: 'article', title: 'Title', seo_title: 'SEO title', seo_description: 'SEO description', cover_image: 'https://images.example.com/cover.png', author: { full_name: 'Jane' }, published_at: '2026-10-01', updated_at: '2026-10-02' } as never)
  expect(await articleMetadata({ params: Promise.resolve({ slug: 'article' }) })).toMatchObject({ title: 'SEO title', description: 'SEO description', openGraph: { type: 'article', publishedTime: '2026-10-01', modifiedTime: '2026-10-02', authors: ['Jane'] }, twitter: { card: 'summary_large_image', images: ['https://images.example.com/cover.png'] } })
})
it.each([categoryMetadata, tagMetadata])('keeps distinct pagination canonicals on taxonomy pages', async generate => {
  const meta = await generate({ params: Promise.resolve({ slug: 'engineering' }), searchParams: Promise.resolve({ page: '2', utm_source: 'audit' }) })
  expect(meta.alternates).toEqual({ canonical: expect.stringMatching(/^https:\/\/www.example.com\/blog\/(category|tag)\/engineering\?page=2$/) })
})
it('does not emit article metadata when no published post exists', async () => {
  vi.mocked(getPostBySlug).mockResolvedValue(null)
  expect(await articleMetadata({ params: Promise.resolve({ slug: 'draft' }) })).toEqual({})
})
it('preserves merged tag redirects in metadata', async () => {
  db.row = { slug: 'alias', name: 'Alias', merged_into: 'target' }
  await expect(tagMetadata({ params: Promise.resolve({ slug: 'alias' }), searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/blog/tag/canonical')
})

it('canonicalizes the blog archive without tracking parameters while preserving real page numbers', async () => {
  const { generateMetadata } = await import('@/app/(public)/blog/page')
  const second = await generateMetadata({ searchParams: Promise.resolve({ page: '2' }) })
  expect(second.alternates).toEqual({ canonical: 'https://www.example.com/blog?page=2' })
  const invalid = await generateMetadata({ searchParams: Promise.resolve({ page: '-2' }) })
  expect(invalid.alternates).toEqual({ canonical: 'https://www.example.com/blog' })
})
it('provides homepage social metadata without inheriting its canonical on other routes', async () => {
  const { metadata } = await import('@/app/(public)/page')
  expect(metadata.alternates).toEqual({ canonical: 'https://www.example.com' })
  expect(metadata.openGraph).toMatchObject({ type: 'website', url: 'https://www.example.com' })
})

// The archive total, rather than parameter syntax, controls indexing eligibility.
it.each([categoryMetadata, tagMetadata])('excludes out-of-range taxonomy pages from indexing', async generate => {
  vi.mocked(getPublishedPosts).mockResolvedValue({ posts: [], total: 13 })
  const meta = await generate({ params: Promise.resolve({ slug: 'engineering' }), searchParams: Promise.resolve({ page: '3' }) })
  expect(meta.robots).toMatchObject({ index: false, follow: true })
  expect(meta.alternates).toEqual({ canonical: expect.stringMatching(/^https:\/\/www.example.com\/blog\/(category|tag)\/engineering$/) })
})
it('excludes past-the-end blog pages, including page 2 of an empty archive', async () => {
  vi.mocked(getPublishedPosts).mockResolvedValue({ posts: [], total: 0 })
  const { generateMetadata } = await import('@/app/(public)/blog/page')
  const meta = await generateMetadata({ searchParams: Promise.resolve({ page: '2' }) })
  expect(meta.robots).toMatchObject({ index: false })
  expect(meta.alternates).toEqual({ canonical: 'https://www.example.com/blog' })
  const first = await generateMetadata({ searchParams: Promise.resolve({ page: '1' }) })
  expect(first.robots).toBeUndefined()
})
it('uses the brand alone for homepage social previews', async () => {
  const { metadata } = await import('@/app/(public)/page')
  expect(metadata.openGraph).toMatchObject({ title: 'The Practical Engineer' })
  expect(metadata.twitter).toMatchObject({ title: 'The Practical Engineer' })
})
