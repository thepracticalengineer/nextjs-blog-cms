// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/auth/assurance', () => ({ checkAssurance: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkAssurance } from '@/lib/auth/assurance'
import { POST } from '@/app/api/post-media/route'
import { GET } from '@/app/api/post-media/library/route'
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let role: 'author' | 'admin' = 'admin'
beforeEach(() => {
 vi.resetAllMocks()
 role = 'admin'
 vi.mocked(checkAssurance).mockResolvedValue(null)
 vi.mocked(createClient).mockResolvedValue({
  auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: owner, role }, error: null }) }) }) }),
 } as unknown as Awaited<ReturnType<typeof createClient>>)
 vi.mocked(createServiceClient).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: { assets: [], total: 0, page: 1, pageSize: 24 }, error: null }) } as unknown as ReturnType<typeof createServiceClient>)
})
const validate = (context = 'page') => POST(new Request(`http://localhost/api/post-media?context=${context}`, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ editorId: owner, url: '/images/page.webp' }) }))
const list = () => GET(new Request(`http://localhost/api/post-media/library?context=page&editorId=${owner}`))
it('permits an administrator through actual session and permission checks', async () => {
 expect((await validate()).status).toBe(200)
 expect((await list()).status).toBe(200)
})
it('denies authors page media while preserving post media permission', async () => {
 role = 'author'
 expect((await validate()).status).toBe(403)
 expect((await list()).status).toBe(403)
 expect(createServiceClient).not.toHaveBeenCalled()
 expect((await validate('post')).status).toBe(200)
})
it('requires completed MFA for administrators before any library access', async () => {
 vi.mocked(checkAssurance).mockResolvedValue('MFA_REQUIRED')
 expect((await validate()).status).toBe(403)
 const response = await list()
 expect(response.status).toBe(403)
 expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' })
 expect(createServiceClient).not.toHaveBeenCalled()
})
