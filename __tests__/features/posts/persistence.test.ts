import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
import { createServiceClient } from '@/lib/supabase/service'
import { savePostAtomic } from '@/features/posts/persistence'
const rpc = vi.fn()
beforeEach(() => {
  rpc.mockResolvedValue({ data: { post: { id: 'post' }, replayed: false }, error: null })
  vi.mocked(createServiceClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createServiceClient>)
})
it('never forwards retired chat provenance even if a stale runtime caller supplies it', async () => {
  const staleInput = { actorId: 'owner', payload: { title: 'Human draft' }, chatId: 'retired-chat' }
  await savePostAtomic(staleInput)
  expect(rpc).toHaveBeenCalledWith('save_post_atomic', expect.objectContaining({ p_chat_id: null, p_actor_id: 'owner' }))
})
it('rejects invalid video JSON and legacy iframes before an atomic write', async () => {
  rpc.mockClear()
  for (const content of [JSON.stringify({ type: 'doc', content: [{ type: 'video', attrs: { src: 'javascript:x' } }] }), '<iframe src="https://evil.test/embed/a"></iframe>']) {
    expect((await savePostAtomic({ actorId: 'owner', payload: { content } })).error?.code).toBe('INVALID_VIDEO')
  }
  expect(rpc).not.toHaveBeenCalled()
})
it('preserves video URLs in the atomic save payload', async () => {
  const content = JSON.stringify({ type: 'doc', content: [{ type: 'video', attrs: { src: 'https://cdn.example/movie.mp4?token=abc' } }] })
  await savePostAtomic({ actorId: 'owner', payload: { content } })
  expect(rpc).toHaveBeenLastCalledWith('save_post_atomic', expect.objectContaining({ p_payload: { content } }))
})
