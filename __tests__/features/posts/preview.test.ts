import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ getProfile: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { getProfile } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { previewPost } from '@/features/posts/preview'
import { renderEditorHtml } from '@/components/editor/EditorContent'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getProfile).mockResolvedValue({ id: 'author-a', role: 'author' } as Awaited<ReturnType<typeof getProfile>>)
})
describe('private unsaved reader preview', () => {
  it('requires authentication and the editor account, without touching the database', async () => {
    vi.mocked(getProfile).mockResolvedValueOnce(null)
    expect((await previewPost('Private writing')).error).toBe('Unauthorized')
    expect((await previewPost('Private writing', 'other-user')).error).toContain('account changed')
    expect(createClient).not.toHaveBeenCalled()
  })
  it('cannot preview someone else’s post even when a client passes unsaved input', async () => {
    const single = vi.fn().mockResolvedValue({ data: { author_id: 'other-user' } })
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single }
    const from = vi.fn().mockReturnValue(query)
    vi.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>)
    expect((await previewPost('Private writing', 'author-a', 'post-a')).error).toBe('Unauthorized')
    expect(from).toHaveBeenCalledExactlyOnceWith('posts')
    expect(query.select).toHaveBeenCalledWith('author_id')
  })
  it('uses public formatting for TipTap headings, links, tables and code blocks', async () => {
    const content = JSON.stringify({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Current unsaved heading' }] },
      { type: 'codeBlock', content: [{ type: 'text', text: 'const limit = 10' }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }] }] }] },
    ] })
    const result = await previewPost(content, 'author-a')
    expect(result.content).toContain('<h2>Current unsaved heading</h2>')
    expect(result.content).toContain('<pre style=')
    expect(result.content).toContain('border border-border px-3 py-2')
    expect(renderEditorHtml(content)).toContain('<h2>Current unsaved heading</h2>')
    expect(createClient).not.toHaveBeenCalled()
  })
  it('strips active legacy HTML and unsafe image/link protocols', async () => {
    const result = await previewPost('<script>alert(1)</script><p onclick="alert(1)">Article</p><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">Link</a><iframe src="https://example.com"></iframe>')
    expect(result.content).toContain('<p>Article</p>')
    expect(result.content).not.toMatch(/script|onclick|onerror|iframe|javascript:/)
  })
  it('rejects oversized input without persistence', async () => {
    expect((await previewPost('a'.repeat(500_001))).error).toContain('too large')
    expect(createClient).not.toHaveBeenCalled()
  })
})
