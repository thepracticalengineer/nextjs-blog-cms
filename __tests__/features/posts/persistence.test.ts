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
