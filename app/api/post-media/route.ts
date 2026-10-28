import { mediaContext } from '@/features/posts/media/context'
import { authorizeApi } from '@/lib/auth/api'
import { ImageStorageError, storageUnavailable, storeImage } from '@/features/posts/media/store'
import { isCoverImageAllowed, COVER_IMAGE_ERROR } from '@/lib/cover-images'
import { optimizeImage } from '@/features/posts/media/optimize'
import { MAX_IMAGE_BYTES } from '@/features/posts/media/validation'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'
const failure = (error: string, status: number) => Response.json({ error }, { status })

export async function POST(request: Request) {
  const context = mediaContext(request)
  if (!context) return failure('Invalid media context.', 400)
  const { profile, response } = await authorizeApi(context === 'page' ? 'pages:update' : 'posts:create')
  if (response) return response
  // Cookie-authenticated uploads must originate in this application.
  if (request.headers.get('origin') !== new URL(request.url).origin) return failure('Upload from the editor in this application.', 403)
  if (!checkRateLimit(`post-media:${profile.id}`, 30, 60_000).allowed) return failure('Too many image requests. Wait a minute, then retry.', 429)
  try {
    // Bound the stream even when Content-Length is absent or untrusted.
    const reader = request.body?.getReader()
    if (!reader) return failure('Choose an image or enter an image URL.', 400)
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_IMAGE_BYTES + 64 * 1024) {
        await reader.cancel()
        return failure('This image exceeds 4 MB. Choose a smaller file.', 413)
      }
      chunks.push(value)
    }
    const body = Buffer.concat(chunks)
    const contentType = request.headers.get('content-type') ?? ''
    let editorId: unknown
    let file: FormDataEntryValue | null = null
    let intent: FormDataEntryValue | null = null
    let url: unknown
    if (contentType.startsWith('application/json')) {
      const values = JSON.parse(body.toString()) as Record<string, unknown>
      if (Object.hasOwn(values, 'context')) return failure('Supply media context in the query only.', 400)
      editorId = values.editorId
      url = values.url
    } else if (contentType.startsWith('multipart/form-data')) {
      const form = await new Response(body, { headers: { 'content-type': contentType } }).formData()
      if (form.has('context')) return failure('Supply media context in the query only.', 400)
      editorId = form.get('editorId')
      file = form.get('file')
      intent = form.get('intent')
    } else return failure('Use the image picker or paste an image in the editor.', 400)
    if (editorId !== profile.id) return failure('The signed-in account changed. Sign in with the account that opened this editor, then retry.', 403)
    if (url !== undefined) {
      if (typeof url !== 'string' || !url || url.length > 2048 || !isCoverImageAllowed(url)) return failure(COVER_IMAGE_ERROR, 422)
      return Response.json({ src: url })
    }
    if (intent !== null && intent !== 'editor' && intent !== 'library') return failure('Invalid upload intent.', 400)
    if (!(file instanceof File)) return failure('Choose an image file.', 400)
    let optimized: Awaited<ReturnType<typeof optimizeImage>>
    try { optimized = await optimizeImage(file) } catch (error) {
      // Decoder internals are deliberately not returned to the browser.
      const message = error instanceof Error && /^(Choose|This|The file|The optimized)/.test(error.message)
        ? error.message : 'This image could not be decoded. Choose a valid, non-animated image under 40 megapixels.'
      return failure(message, 422)
    }
    try {
      // Page documents are not post-media cleanup references; retain their uploads durably.
      const stored = await storeImage(profile.id, optimized.data, { filename: file.name, width: optimized.width, height: optimized.height, library: context === 'page' || intent === 'library' })
      return Response.json({ ...stored, width: optimized.width, height: optimized.height })
    } catch (error) {
      return failure(error instanceof ImageStorageError ? error.message : storageUnavailable, 503)
    }
  } catch {
    return failure('Image request failed. Check your connection, choose a valid file and retry. Your writing is preserved.', 400)
  }
}
