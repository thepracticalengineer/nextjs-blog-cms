import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const storageCode = (error: object) => 'code' in error ? String(error.code) : ''
const storageUnavailable = 'Image storage is unavailable. Retry shortly or ask an administrator to check image storage.'

/** Upgrade only this owner's legacy registry entries. Objects and URLs stay intact. */
async function hashLegacyMedia(db: ReturnType<typeof createServiceClient>, ownerId: string) {
  let after = ''
  while (true) {
    const { data, error } = await db.from('post_media').select('path').eq('owner_id', ownerId)
      .eq('state', 'active').is('content_sha256', null).order('path').gt('path', after).limit(50)
    if (error) throw new Error(storageUnavailable)
    if (!data?.length) return
    for (const media of data) {
      const { data: object, error: downloadError } = await db.storage.from('post-media').download(media.path)
      if (downloadError) {
        // Old failed/interrupted registrations may have no storage object.
        if (downloadError.statusCode === '404' || storageCode(downloadError) === 'NoSuchKey') continue
        throw new Error(storageUnavailable)
      }
      if (!object) throw new Error(storageUnavailable)
      const { error: updateError } = await db.from('post_media').update({ content_sha256: hash(Buffer.from(await object.arrayBuffer())) })
        .eq('owner_id', ownerId).eq('path', media.path)
      if (updateError) throw new Error(storageUnavailable)
    }
    after = data[data.length - 1].path
  }
}

/** DB reservation + immutable storage writes enforce reuse across server instances. */
export async function storeImage(ownerId: string, bytes: Buffer) {
  const db = createServiceClient()
  await hashLegacyMedia(db, ownerId)
  const bucket = db.storage.from('post-media')
  const proposedPath = `${ownerId}/${randomUUID()}.webp`
  const { data: publicUrl } = bucket.getPublicUrl(proposedPath)
  const { data: media, error } = await db.rpc('reserve_post_media', {
    p_owner_id: ownerId, p_content_sha256: hash(bytes), p_path: proposedPath, p_url: publicUrl.publicUrl,
  })
  if (error || !media || typeof media.path !== 'string' || typeof media.url !== 'string' || !media.path.startsWith(`${ownerId}/`)) {
    throw new Error(storageUnavailable)
  }
  // All contenders write the same immutable key. Storage completes one write;
  // duplicate responses reuse that object. A failed write can retry the same key.
  const { error: uploadError } = await bucket.upload(media.path, bytes, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' })
  const reused = !!uploadError && (uploadError.statusCode === '409' || ['Duplicate', 'ResourceAlreadyExists'].includes(storageCode(uploadError)))
  if (uploadError && !reused) throw new Error('Image upload failed. Check your connection and retry. Your writing is preserved.')
  return { src: media.url, reused }
}
