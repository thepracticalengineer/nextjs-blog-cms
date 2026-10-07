import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readImageDimensions, uploadImage, validateImageUrl } from '@/features/posts/media/client'

const file = () => new File(['image'], 'board.png', { type: 'image/png' })
let xhr: {
  open: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn>
  upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void }
  status: number; responseText: string; timeout: number
  onload?: () => void; onerror?: () => void; ontimeout?: () => void; onabort?: () => void
}
beforeEach(() => {
  xhr = { open: vi.fn(), send: vi.fn(), abort: vi.fn(() => xhr.onabort?.()), upload: {}, status: 200, responseText: JSON.stringify({ src: 'https://images.example.com/board.webp', width: 400, height: 300 }), timeout: 0 }
  vi.stubGlobal('XMLHttpRequest', function () { return xhr })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('image transfer client', () => {
  it('posts selected bytes with the editor identity and reports actual transfer progress', async () => {
    const progress = vi.fn()
    const promise = uploadImage(file(), 'author-a', progress, new AbortController().signal)
    expect(xhr.open).toHaveBeenCalledWith('POST', '/api/post-media')
    const form = xhr.send.mock.calls[0][0] as FormData
    expect(form.get('editorId')).toBe('author-a')
    expect((form.get('file') as File).name).toBe('board.png')
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 })
    expect(progress).toHaveBeenCalledWith(50)
    xhr.onload?.()
    await expect(promise).resolves.toMatchObject({ src: 'https://images.example.com/board.webp', width: 400, height: 300 })
  })
  it.each(['onerror', 'ontimeout'] as const)('returns actionable failures for %s', async event => {
    const promise = uploadImage(file(), 'author-a', vi.fn(), new AbortController().signal)
    xhr[event]?.()
    await expect(promise).rejects.toThrow('Check your connection and retry')
  })
  it('returns server validation errors and handles non-JSON failures', async () => {
    const promise = uploadImage(file(), 'author-a', vi.fn(), new AbortController().signal)
    xhr.status = 422
    xhr.responseText = JSON.stringify({ error: 'Choose a supported image file.' })
    xhr.onload?.()
    await expect(promise).rejects.toThrow('Choose a supported image file')
    const broken = uploadImage(file(), 'author-a', vi.fn(), new AbortController().signal)
    xhr.responseText = '<html>Gateway error</html>'
    xhr.onload?.()
    await expect(broken).rejects.toThrow('Check your connection and retry')
  })
  it('cancels uploads and avoids sending requests with an already cancelled signal', async () => {
    const controller = new AbortController()
    const promise = uploadImage(file(), 'author-a', vi.fn(), controller.signal)
    controller.abort()
    await expect(promise).rejects.toThrow('cancelled')
    expect(xhr.abort).toHaveBeenCalled()
    xhr.send.mockClear()
    await expect(uploadImage(file(), 'author-a', vi.fn(), controller.signal)).rejects.toThrow('cancelled')
    expect(xhr.send).not.toHaveBeenCalled()
  })
  it('validates file metadata before creating a request', async () => {
    await expect(uploadImage(new File(['svg'], 'x.svg', { type: 'image/svg+xml' }), 'author-a', vi.fn(), new AbortController().signal)).rejects.toThrow('not supported')
    expect(xhr.send).not.toHaveBeenCalled()
  })
  it('passes the editor identity for URL validation and handles unsupported hosts', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ src: '/images/board.webp' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Host unsupported. Upload instead.' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => { throw new SyntaxError() } })
    vi.stubGlobal('fetch', fetcher)
    await expect(validateImageUrl('/images/board.webp', 'author-a')).resolves.toBe('/images/board.webp')
    expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify({ url: '/images/board.webp', editorId: 'author-a' }))
    await expect(validateImageUrl('https://unknown.example/board.jpg', 'author-a')).rejects.toThrow('Upload instead')
    await expect(validateImageUrl('https://unknown.example/board.jpg', 'author-a')).rejects.toThrow('Check your connection')
  })
  it('gets image dimensions and handles broken URLs, timeout and cancellation', async () => {
    vi.useFakeTimers()
    let image: { onload?: () => void; onerror?: () => void; src?: string; naturalWidth: number; naturalHeight: number }
    vi.stubGlobal('Image', function () { image = { naturalWidth: 400, naturalHeight: 300 }; return image })
    const dimensions = readImageDimensions('/board.webp', new AbortController().signal)
    image!.onload?.()
    await expect(dimensions).resolves.toEqual({ width: 400, height: 300 })
    const broken = readImageDimensions('/missing.webp', new AbortController().signal)
    image!.onerror?.()
    await expect(broken).rejects.toThrow('could not be loaded')
    const timed = readImageDimensions('/slow.webp', new AbortController().signal)
    const rejection = expect(timed).rejects.toThrow('could not be loaded')
    await vi.advanceTimersByTimeAsync(15_000)
    await rejection
    const controller = new AbortController()
    const aborted = readImageDimensions('/board.webp', controller.signal)
    controller.abort()
    await expect(aborted).rejects.toThrow('could not be loaded')
    await expect(readImageDimensions('/board.webp', controller.signal)).rejects.toThrow('could not be loaded')
  })
})
