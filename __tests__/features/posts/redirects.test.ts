import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { getPostRedirect } from '@/features/posts/queries'
import { postClient, validPost } from '../../helpers/publication'

beforeEach(() => vi.clearAllMocks())
function useRoutes(status = 'published', current = 'current-url') {
  const db = postClient([{ ...validPost, status, slug: current }], 'Frank Mendez', [], [
    { slug: 'original-url', post_id: validPost.id, was_published: true },
    { slug: 'intermediate-url', post_id: validPost.id, was_published: true },
    { slug: 'private-draft-url', post_id: validPost.id, was_published: false },
  ])
  vi.mocked(createClient).mockResolvedValue(db.client as unknown as Awaited<ReturnType<typeof createClient>>)
  return db
}
describe('published URL redirects', () => {
  it('resolves every former URL directly to the current slug', async () => {
    useRoutes()
    expect(await getPostRedirect('original-url')).toBe('current-url')
    expect(await getPostRedirect('intermediate-url')).toBe('current-url')
  })
  it('does not redirect unknown URLs, draft-only URLs or the current URL', async () => {
    useRoutes()
    for (const slug of ['missing', 'private-draft-url', 'current-url']) expect(await getPostRedirect(slug)).toBeNull()
  })
  it('does not expose an unpublished destination', async () => {
    useRoutes('draft')
    expect(await getPostRedirect('original-url')).toBeNull()
  })
  it('cannot form a loop when a post returns to one of its old URLs', async () => {
    useRoutes('published', 'original-url')
    expect(await getPostRedirect('original-url')).toBeNull()
    expect(await getPostRedirect('intermediate-url')).toBe('original-url')
  })
})
