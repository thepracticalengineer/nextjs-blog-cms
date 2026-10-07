import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/features/posts/queries', () => ({ getPostBySlug: vi.fn(), getPostRedirect: vi.fn(), getAllPublishedSlugs: vi.fn() }))
vi.mock('@/components/editor/EditorContent', () => ({ EditorContent: () => null }))
vi.mock('@/features/comments/components/CommentSection', () => ({ CommentSection: () => null }))
vi.mock('@/components/newsletter/SubscribeForm', () => ({ SubscribeForm: () => null }))
import PostPage from '@/app/(public)/blog/[slug]/page'
import { getPostBySlug, getPostRedirect } from '@/features/posts/queries'

beforeEach(() => { vi.clearAllMocks(); vi.mocked(getPostBySlug).mockResolvedValue(null) })
describe('former published URL route', () => {
  it('issues a real Next.js permanent 308 redirect', async () => {
    vi.mocked(getPostRedirect).mockResolvedValue('current-url')
    await expect(PostPage({ params: Promise.resolve({ slug: 'old-url' }) })).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;replace;/blog/current-url;308;' })
  })
  it('returns 404 when neither a published post nor public redirect exists', async () => {
    vi.mocked(getPostRedirect).mockResolvedValue(null)
    await expect(PostPage({ params: Promise.resolve({ slug: 'private-or-missing' }) })).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
  })
})
