// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ authorizeSession: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }))
import { POST } from '@/app/api/post-media/route'
import { authorizeSession } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit } from '@/lib/rateLimit'
import { optimizeImage } from '@/features/posts/media/optimize'
import { MAX_IMAGE_BYTES } from '@/features/posts/media/validation'

const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const upload = vi.fn()
const rpc = vi.fn()
const legacyRows = vi.fn()
const update = vi.fn()
const download = vi.fn()
const ownerFilter = vi.fn()
function request(file?: File, editorId = actor, origin = 'http://localhost') {
  const form = new FormData()
  if (file) form.set('file', file)
  form.set('editorId', editorId)
  return new Request('http://localhost/api/post-media', { method: 'POST', headers: { origin }, body: form })
}
const fixture = async (format: 'png' | 'jpeg' | 'webp' = 'png', width = 48) => new File([
  await sharp({ create: { width, height: 32, channels: 3, background: '#20a0d0' } }).toFormat(format).toBuffer(),
], `cover.${format}`, { type: `image/${format}` })
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: true })
  vi.mocked(authorizeSession).mockResolvedValue({ profile: { id: actor, role: 'author' }, failure: null } as Awaited<ReturnType<typeof authorizeSession>>)
  upload.mockResolvedValue({ error: null })
  ownerFilter.mockImplementation(() => ({ eq: () => ({ is: () => ({ order: () => ({ gt: () => ({ limit: legacyRows }) }) }) }) }))
  legacyRows.mockResolvedValue({ data: [], error: null })
  update.mockReturnValue({ eq: () => ({ eq: async () => ({ error: null }) }) })
  const reservations = new Map<string, { path: string; url: string }>()
  rpc.mockImplementation(async (_name, args) => {
    const key = `${args.p_owner_id}:${args.p_content_sha256}`
    if (!reservations.has(key)) reservations.set(key, { path: args.p_path, url: args.p_url })
    return { data: reservations.get(key), error: null }
  })
  vi.mocked(createServiceClient).mockReturnValue({
    rpc,
    from: vi.fn(() => ({ update, select: () => ({ eq: ownerFilter }) })),
    storage: { from: vi.fn(() => ({ upload, download, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/post-media/${path}` } }) })) },
  } as unknown as ReturnType<typeof createServiceClient>)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('IMAGE_REMOTE_HOSTS', 'images.example.com')
})
afterEach(() => vi.unstubAllEnvs())

describe('owned, decoded post image upload', () => {
  it.each(['png', 'jpeg', 'webp'] as const)('optimizes %s and returns an immutable owner path and dimensions', async format => {
    const response = await POST(request(await fixture(format, 3000)))
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result).toMatchObject({ width: 2400 })
    expect(result.src).toContain(`/post-media/${actor}/`)
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${actor}/[a-f0-9-]+\\.webp$`)), expect.any(Buffer), expect.objectContaining({ contentType: 'image/webp', upsert: false }))
    const meta = await sharp(upload.mock.calls[0][1]).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(2400)
    expect(meta.exif).toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('reserve_post_media', expect.objectContaining({ p_owner_id: actor, p_content_sha256: createHash('sha256').update(upload.mock.calls[0][1]).digest('hex') }))
  })
  it('rejects anonymous, unauthorized-role, changed-account and cross-origin requests before storage', async () => {
    vi.mocked(authorizeSession).mockResolvedValueOnce({ profile: null, failure: { code: 'UNAUTHENTICATED', status: 401, error: 'Sign in again' } })
    expect((await POST(request())).status).toBe(401)
    vi.mocked(authorizeSession).mockResolvedValueOnce({ profile: null, failure: { code: 'FORBIDDEN', status: 403, error: 'Forbidden' } })
    expect((await POST(request())).status).toBe(403)
    expect((await POST(request(await fixture(), 'other-user'))).status).toBe(403)
    expect((await POST(request(await fixture(), actor, 'https://attacker.example'))).status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
  it.each([
    new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' }),
    new File(['not an image'], 'cover.png', { type: 'image/png' }),
    new File([], 'empty.jpg', { type: 'image/jpeg' }),
  ])('rejects unsupported, corrupt and empty files without uploading', async file => {
    expect((await POST(request(file))).status).toBe(422)
    expect(upload).not.toHaveBeenCalled()
  })
  it('checks content rather than trusting the supplied MIME type', async () => {
    const png = await fixture()
    expect((await POST(request(new File([await png.arrayBuffer()], 'fake.jpg', { type: 'image/jpeg' })))).status).toBe(422)
    expect(upload).not.toHaveBeenCalled()
  })
  it('rejects animated WebP and PNG animation control chunks', async () => {
    const frames = Buffer.alloc(4 * 8 * 3)
    for (let n = 0; n < 16; n++) { frames[n * 3] = 255; frames[(16 + n) * 3 + 2] = 255 }
    const webp = await sharp(frames, { raw: { width: 4, height: 8, pageHeight: 4, channels: 3 } }).webp({ delay: [100, 100] }).toBuffer()
    expect((await sharp(webp).metadata()).pages).toBe(2)
    await expect(optimizeImage(new File([webp], 'animated.webp', { type: 'image/webp' }))).rejects.toThrow('non-animated')
    const png = Buffer.from(await (await fixture()).arrayBuffer())
    const chunk = Buffer.alloc(20)
    chunk.writeUInt32BE(8, 0)
    chunk.write('acTL', 4)
    chunk.writeUInt32BE(2, 8)
    chunk.writeUInt32BE(crc32(chunk.subarray(4, 16)), 16)
    const apng = Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)])
    await expect(optimizeImage(new File([apng], 'animated.png', { type: 'image/png' }))).rejects.toThrow('non-animated')
  })
  it('bounds oversized streaming bodies even without a Content-Length header', async () => {
    const response = await POST(new Request('http://localhost/api/post-media', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'multipart/form-data; boundary=test' }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES + 100_000)); controller.close() } }), duplex: 'half' } as RequestInit))
    expect(response.status).toBe(413)
    expect(upload).not.toHaveBeenCalled()
  })
  it('rejects files over 4 MB and decoded images over 40 megapixels', async () => {
    await expect(optimizeImage(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'large.png', { type: 'image/png' }))).rejects.toThrow('4 MB')
    const pixels = await sharp({ create: { width: 6500, height: 6500, channels: 3, background: '#000' } }).png().toBuffer()
    await expect(optimizeImage(new File([pixels], 'huge.png', { type: 'image/png' }))).rejects.toThrow()
  })
  it('reports registration and upload failures as retryable without returning an unusable URL', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'missing migration' } })
    expect((await POST(request(await fixture()))).status).toBe(503)
    expect(upload).not.toHaveBeenCalled()
    upload.mockResolvedValueOnce({ error: { message: 'offline' } })
    const result = await POST(request(await fixture()))
    expect(result.status).toBe(503)
    expect(await result.json()).toEqual({ error: expect.stringContaining('retry') })
  })
  it('validates URL hosts for both cover and inline insertion', async () => {
    const probe = (url: string) => POST(new Request('http://localhost/api/post-media', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ url, editorId: actor }) }))
    expect((await probe('https://images.example.com/cover.jpg')).status).toBe(200)
    expect((await probe('https://unknown.example.com/cover.jpg')).status).toBe(422)
    expect((await probe('javascript:alert(1)')).status).toBe(422)
    expect(upload).not.toHaveBeenCalled()
  })
  it('limits requests and rejects missing files and malformed input', async () => {
    expect((await POST(request())).status).toBe(400)
    expect((await POST(new Request('http://localhost/api/post-media', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: '{' }))).status).toBe(400)
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfter: 60 })
    expect((await POST(request())).status).toBe(429)
  })
})


describe('content-addressed image reuse', () => {
  it('reuses identical bytes even when renamed, including concurrent requests', async () => {
    const original = await fixture()
    const renamed = new File([await original.arrayBuffer()], 'renamed.png', { type: original.type })
    const responses = await Promise.all([POST(request(original)), POST(request(renamed))])
    const images = await Promise.all(responses.map(response => response.json()))
    expect(responses.map(r => r.status)).toEqual([200, 200])
    expect(images[0].src).toBe(images[1].src)
    expect(upload.mock.calls[0][0]).toBe(upload.mock.calls[1][0])
  })
  it('returns reuse feedback on immutable storage conflicts, but not on arbitrary failures', async () => {
    upload.mockResolvedValueOnce({ error: { statusCode: '400', code: 'ResourceAlreadyExists', message: 'Already exists' } })
    const response = await POST(request(await fixture()))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ reused: true })
    upload.mockResolvedValueOnce({ error: { statusCode: '400', message: 'Invalid upload' } })
    expect((await POST(request(await fixture()))).status).toBe(503)
  })
  it('allows different content with the same filename', async () => {
    const a = await (await POST(request(await fixture('png', 48)))).json()
    const b = await (await POST(request(await fixture('png', 49)))).json()
    expect(a.src).not.toBe(b.src)
  })
  it('retries a failed upload at the same reserved path', async () => {
    const original = await fixture()
    upload.mockResolvedValueOnce({ error: { message: 'Connection lost' } })
    expect((await POST(request(original))).status).toBe(503)
    expect((await POST(request(original))).status).toBe(200)
    expect(upload.mock.calls[0][0]).toBe(upload.mock.calls[1][0])
  })
})


describe('legacy media indexing', () => {
  it('hashes existing owner objects without replacing or deleting them and reuses their URL', async () => {
    const original = await fixture()
    const optimized = await optimizeImage(original)
    const path = `${actor}/11111111-1111-4111-8111-111111111111.webp`
    legacyRows.mockResolvedValueOnce({ data: [{ path }], error: null })
    download.mockResolvedValue({ data: new Blob([optimized.data]), error: null })
    rpc.mockResolvedValueOnce({ data: { path, url: 'https://test.supabase.co/legacy.webp' }, error: null })
    upload.mockResolvedValueOnce({ error: { statusCode: '409' } })
    const response = await POST(request(original))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ src: 'https://test.supabase.co/legacy.webp', reused: true })
    expect(ownerFilter).toHaveBeenCalledWith('owner_id', actor)
    expect(download).toHaveBeenCalledWith(path)
    expect(update).toHaveBeenCalledWith({ content_sha256: createHash('sha256').update(optimized.data).digest('hex') })
  })
  it('skips missing old objects, but fails closed on storage errors instead of creating a duplicate', async () => {
    legacyRows.mockResolvedValueOnce({ data: [{ path: `${actor}/missing.webp` }], error: null })
    download.mockResolvedValueOnce({ error: { code: 'NoSuchKey', statusCode: '400', message: 'Object not found' } })
    expect((await POST(request(await fixture()))).status).toBe(200)
    legacyRows.mockResolvedValueOnce({ data: [{ path: `${actor}/private.webp` }], error: null })
    download.mockResolvedValueOnce({ error: { statusCode: '403', message: 'Access denied' } })
    upload.mockClear()
    expect((await POST(request(await fixture()))).status).toBe(503)
    expect(upload).not.toHaveBeenCalled()
  })
  it('does not upload when legacy indexing fails', async () => {
    legacyRows.mockResolvedValueOnce({ error: { message: 'Database unavailable' } })
    expect((await POST(request(await fixture()))).status).toBe(503)
    expect(upload).not.toHaveBeenCalled()
  })
})
