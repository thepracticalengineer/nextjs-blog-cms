// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ authorizeSession: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
import { authorizeSession } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/service'
import { GET } from '@/app/api/post-media/library/route'
import { PATCH } from '@/app/api/post-media/library/[id]/route'
import { POST } from '@/app/api/post-media/library/[id]/select/route'
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const rpc = vi.fn()
const eq = vi.fn()
const query: Record<string, unknown> = {}
beforeEach(() => {
 vi.resetAllMocks()
 vi.mocked(authorizeSession).mockResolvedValue({ profile: { id: owner, role: 'admin' }, failure: null } as Awaited<ReturnType<typeof authorizeSession>>)
 for (const method of ['select', 'is', 'not', 'ilike', 'order']) query[method] = vi.fn(() => query)
 eq.mockReturnValue(query); query.eq = eq
 query.range = vi.fn().mockResolvedValue({ data: [], count: 0, error: null })
 rpc.mockImplementation(async name => ({ data: name === 'list_media_library' ? { assets: [], total: 0, page: 1, pageSize: 24 } : null, error: null }))
 vi.mocked(createServiceClient).mockReturnValue({ from: () => query, rpc } as unknown as ReturnType<typeof createServiceClient>)
})
it('scopes even administrator reads to the authenticated owner and bounds pages', async () => {
 const res = await GET(new Request(`http://localhost/api/post-media/library?editorId=${owner}`))
 expect(res.status).toBe(200)
 expect(rpc).toHaveBeenCalledWith('list_media_library', { p_owner_id: owner, p_search: '', p_page: 1, p_sort: 'newest', p_filter: 'active' })
 expect(await res.json()).toEqual({ assets: [], total: 0, page: 1, pageSize: 24 })
})
it('rejects changed accounts, invalid pagination and oversized searches before private access', async () => {
 for (const query of ['editorId=other', `editorId=${owner}&page=-1`, `editorId=${owner}&q=${'x'.repeat(201)}`]) {
  expect((await GET(new Request(`http://localhost/api/post-media/library?${query}`))).status).toBeGreaterThanOrEqual(400)
 }
 expect(createServiceClient).not.toHaveBeenCalled()
})
it('uses session and MFA authorization before reading', async () => {
 vi.mocked(authorizeSession).mockResolvedValueOnce({ profile: null, failure: { code: 'MFA_REQUIRED', error: 'Verify', status: 403 } } as Awaited<ReturnType<typeof authorizeSession>>)
 expect((await GET(new Request(`http://localhost/api/post-media/library?editorId=${owner}`))).status).toBe(403)
 expect(createServiceClient).not.toHaveBeenCalled()
})
it('rejects cross-origin mutations and malformed metadata', async () => {
 const make = (body: unknown, origin = 'http://localhost') => new Request('http://localhost/api/post-media/library/'+id, { method: 'PATCH', headers: { origin }, body: JSON.stringify(body) })
 expect((await PATCH(make({ editorId: owner, title: 'ok' }, 'https://evil.test'), { params: Promise.resolve({ id }) })).status).toBe(403)
 expect((await PATCH(make({ editorId: owner, title: 'x'.repeat(256) }), { params: Promise.resolve({ id }) })).status).toBe(400)
 expect((await PATCH(make({ editorId: owner, owner_id: owner }), { params: Promise.resolve({ id }) })).status).toBe(400)
 expect(createServiceClient).not.toHaveBeenCalled()
})
it('selects only through owner-scoped durable RPC and returns 404 for missing/foreign assets', async () => {
 const req = new Request('http://localhost/api/post-media/library/'+id+'/select', { method: 'POST', headers: { origin: 'http://localhost' }, body: JSON.stringify({ editorId: owner }) })
 expect((await POST(req, { params: Promise.resolve({ id }) })).status).toBe(404)
 expect(rpc).toHaveBeenCalledWith('mutate_media_library', { p_owner_id: owner, p_id: id, p_changes: {}, p_select: true })
})
it('returns only the public asset DTO after an owner mutation', async () => {
 const asset = { id, url: 'https://test/image', original_filename: null, title: 'Changed', alt_text: '', caption: '', description: '', width: null, height: null, byte_size: null, uploaded_at: null, archived_at: null }
 rpc.mockResolvedValueOnce({ data: { ...asset, owner_id: owner, retained: true, content_sha256: 'private', path: 'internal' }, error: null })
 const req = new Request('http://localhost/api/post-media/library/'+id, { method: 'PATCH', headers: { origin: 'http://localhost' }, body: JSON.stringify({ editorId: owner, title: 'Changed' }) })
 const res = await PATCH(req, { params: Promise.resolve({ id }) })
 expect(res.status).toBe(200)
 expect(res.headers.get('cache-control')).toBe('no-store')
 expect(await res.json()).toEqual({ asset })
 expect(rpc).toHaveBeenCalledWith('mutate_media_library', { p_owner_id: owner, p_id: id, p_changes: { title: 'Changed' }, p_select: false })
})
it('rejects changed accounts on selection before creating a service client', async () => {
 const req = new Request('http://localhost/api/post-media/library/'+id+'/select', { method: 'POST', headers: { origin: 'http://localhost' }, body: JSON.stringify({ editorId: 'previous-account' }) })
 expect((await POST(req, { params: Promise.resolve({ id }) })).status).toBe(403)
 expect(createServiceClient).not.toHaveBeenCalled()
})
it('filters archived assets and escapes literal search wildcards', async () => {
 expect((await GET(new Request(`http://localhost/api/post-media/library?editorId=${owner}&filter=archived&q=50%25_&page=2&sort=title`))).status).toBe(200)
 expect(rpc).toHaveBeenCalledWith('list_media_library', { p_owner_id: owner, p_search: '50%_', p_page: 2, p_sort: 'title', p_filter: 'archived' })
})

it('reports malformed JSON explicitly before any service access', async () => {
 const req = new Request('http://localhost/api/post-media/library/'+id, { method: 'PATCH', headers: { origin: 'http://localhost' }, body: '{broken' })
 const res = await PATCH(req, { params: Promise.resolve({ id }) })
 expect(res.status).toBe(400)
 expect(await res.json()).toEqual({ error: 'Invalid JSON in media request.' })
 expect(createServiceClient).not.toHaveBeenCalled()
})
