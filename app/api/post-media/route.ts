import { randomUUID } from 'node:crypto'
import { getProfile } from '@/lib/auth/session'
import { can, type Role } from '@/lib/permissions'
import { createServiceClient } from '@/lib/supabase/service'
import { isCoverImageAllowed, COVER_IMAGE_ERROR } from '@/lib/cover-images'
import { optimizeImage } from '@/features/posts/media/optimize'
import { MAX_IMAGE_BYTES } from '@/features/posts/media/validation'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'
const failure = (error: string, status: number) => Response.json({ error }, { status })

export async function POST(request: Request) {
  const profile = await getProfile()
  if (!profile) return failure('Sign in again, then retry. Your writing is preserved.', 401)
  if (!can(profile.role as Role, 'posts:create')) return failure('You do not have permission to upload post images.', 403)
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
        return failure('This image exceeds 10 MB. Choose a smaller file.', 413)
      }
      chunks.push(value)
    }
    const body = Buffer.concat(chunks)
    const contentType = request.headers.get('content-type') ?? ''
    let editorId: unknown
    let file: FormDataEntryValue | null = null
    let url: unknown
    if (contentType.startsWith('application/json')) {
      const values = JSON.parse(body.toString()) as Record<string, unknown>
      editorId = values.editorId
      url = values.url
    } else if (contentType.startsWith('multipart/form-data')) {
      const form = await new Response(body, { headers: { 'content-type': contentType } }).formData()
      editorId = form.get('editorId')
      file = form.get('file')
    } else return failure('Use the image picker or paste an image in the editor.', 400)
    if (editorId !== profile.id) return failure('The signed-in account changed. Sign in with the account that opened this editor, then retry.', 403)
    if (url !== undefined) {
      if (typeof url !== 'string' || !url || url.length > 2048 || !isCoverImageAllowed(url)) return failure(COVER_IMAGE_ERROR, 422)
      return Response.json({ src: url })
    }
    if (!(file instanceof File)) return failure('Choose an image file.', 400)
    let optimized: Awaited<ReturnType<typeof optimizeImage>>
    try { optimized = await optimizeImage(file) } catch (error) {
      // Decoder internals are deliberately not returned to the browser.
      const message = error instanceof Error && /^(Choose|This|The file|The optimized)/.test(error.message)
        ? error.message : 'This image could not be decoded. Choose a valid, non-animated image under 40 megapixels.'
      return failure(message, 422)
    }
    const db = createServiceClient()
    const path = `${profile.id}/${randomUUID()}.webp`
    const bucket = db.storage.from('post-media')
    const { data: publicUrl } = bucket.getPublicUrl(path)
    // Register before uploading so even interrupted storage writes are reclaimable.
    const { error: registrationError } = await db.from('post_media').insert({ owner_id: profile.id, path, url: publicUrl.publicUrl })
    if (registrationError) return failure('Image storage is unavailable. Retry shortly or ask an administrator to check image storage.', 503)
    const { error: uploadError } = await bucket.upload(path, optimized.data, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' })
    if (uploadError) return failure('Image upload failed. Check your connection and retry. Your writing is preserved.', 503)
    return Response.json({ src: publicUrl.publicUrl, width: optimized.width, height: optimized.height })
  } catch {
    return failure('Image request failed. Check your connection, choose a valid file and retry. Your writing is preserved.', 400)
  }
}
