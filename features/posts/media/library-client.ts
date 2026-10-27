import type { MediaAsset } from './library-types'

export async function mediaRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store' })
  const result = await response.json().catch(() => { throw new Error('Media request failed. Check your connection and retry.') })
  if (!response.ok) throw new Error(result.error ?? 'Media request failed. Retry shortly.')
  return result as T
}
export function mediaMutation(id: string, editorId: string, values: Record<string, unknown>, select = false) {
  return mediaRequest<{ asset: MediaAsset }>(`/api/post-media/library/${encodeURIComponent(id)}${select ? '/select' : ''}`, {
    method: select ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...values, editorId }),
  })
}
export const assetName = (asset: MediaAsset) => asset.title || asset.original_filename || 'Untitled image'
export const assetSize = (bytes: number | null) => bytes === null ? 'Size unknown' : `${Math.max(1, Math.round(bytes / 1024))} KB`
