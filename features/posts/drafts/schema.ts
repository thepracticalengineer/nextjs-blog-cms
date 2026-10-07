import { z } from 'zod'
import type { PostWithRelations } from '../types'

// Recovery never restores a previous editorial approval.
export const draftValuesSchema = z.object({
  title: z.string(), slug: z.string(), excerpt: z.string(), content: z.string(),
  cover_image: z.string(), category_id: z.string(), seo_title: z.string(),
  seo_description: z.string(), tag_ids: z.array(z.string()),
})
export type DraftValues = z.infer<typeof draftValuesSchema>
export type WorkingCopy = {
  document_id: string
  post_id: string | null
  values: DraftValues
  revision: string
  base_updated_at: string | null
  updated_at: string
}
export function draftValues(post?: PostWithRelations): DraftValues {
  return {
    title: post?.title ?? '', slug: post?.slug ?? '', excerpt: post?.excerpt ?? '',
    content: post?.content ?? '', cover_image: post?.cover_image ?? '', category_id: post?.category_id ?? '',
    seo_title: post?.seo_title ?? '', seo_description: post?.seo_description ?? '',
    tag_ids: post?.tags?.map(tag => tag.id) ?? [],
  }
}
export function snapshot(values: DraftValues): string {
  return JSON.stringify(draftValuesSchema.parse(values))
}
