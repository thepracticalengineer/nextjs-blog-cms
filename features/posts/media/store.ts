import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const storageCode = (error: object) => 'code' in error ? String(error.code) : ''
export const storageUnavailable = 'Image storage is unavailable. Retry shortly or ask an administrator to check image storage.'

export class ImageStorageError extends Error {}

/** DB reservation + immutable storage writes enforce reuse across server instances. */
export async function storeImage(ownerId: string, bytes: Buffer, metadata: { filename: string; width: number; height: number; library: boolean }) {
  const db = createServiceClient()
  // Constant-size indexed readiness check; downloads/hashing happen offline.
  const { data: pending, error: pendingError } = await db.from('post_media').select('path')
    .eq('owner_id', ownerId).eq('state', 'active').is('content_sha256', null).is('hash_checked_at', null).limit(1)
  if (pendingError) throw new ImageStorageError(storageUnavailable)
  if (pending?.length) throw new ImageStorageError('Image library indexing is pending. Ask an administrator to complete media indexing, then retry.')
  const bucket = db.storage.from('post-media')
  const proposedPath = `${ownerId}/${randomUUID()}.webp`
  const { data: publicUrl } = bucket.getPublicUrl(proposedPath)
  const { data: media, error } = await db.rpc('reserve_post_media', {
    p_owner_id: ownerId, p_content_sha256: hash(bytes), p_path: proposedPath, p_url: publicUrl.publicUrl,
  })
  if (error || !media || typeof media.path !== 'string' || typeof media.url !== 'string' || !media.path.startsWith(`${ownerId}/`)) {
    throw new ImageStorageError(storageUnavailable)
  }
  // All contenders write the same immutable key. Storage completes one write;
  // duplicate responses reuse that object. A failed write can retry the same key.
  const { error: uploadError } = await bucket.upload(media.path, bytes, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' })
  const reused = !!uploadError && (uploadError.statusCode === '409' || ['Duplicate', 'ResourceAlreadyExists'].includes(storageCode(uploadError)))
  if (uploadError && !reused) throw new ImageStorageError('Image upload failed. Check your connection and retry. Your writing is preserved.')
  const { data: completed, error: completionError } = await db.rpc('complete_post_media', {
    p_owner_id: ownerId, p_path: media.path, p_filename: [...metadata.filename].slice(0, 255).join(''),
    p_width: metadata.width, p_height: metadata.height, p_byte_size: bytes.byteLength, p_library: metadata.library,
  })
  if (completionError || completed !== true) throw new ImageStorageError(storageUnavailable)
  const { data: asset, error: assetError } = await db.from('post_media').select('id,archived_at')
    .eq('owner_id', ownerId).eq('path', media.path).eq('state', 'active').eq('upload_status', 'ready').maybeSingle()
  if (assetError || !asset || typeof asset.id !== 'string') throw new ImageStorageError(storageUnavailable)
  return { src: media.url, reused, assetId: asset.id, archived: asset.archived_at !== null }
}
