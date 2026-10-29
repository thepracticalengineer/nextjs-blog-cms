import { z } from 'zod'
import { pageDocumentSchema } from './document'
export { pageDocumentSchema } from './document'

// Installed Zod and PostgreSQL both count Unicode code points.
const text = (maximum: number) => z.string().max(maximum)
  .refine(value => value.isWellFormed() && !value.includes(String.fromCharCode(0)), 'Text must be valid PostgreSQL Unicode')

export const pageValuesSchema = z.strictObject({
  title: text(200).refine(value => value.trim().length > 0),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  seo_title: text(200),
  seo_description: text(500),
  document: pageDocumentSchema,
})
const requestKey = text(200).refine(value => value.trim().length > 0)
const existing = { pageId: z.uuid(), expectedRevision: z.uuid(), requestKey }
export const pageWriteSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('create'), requestKey, values: pageValuesSchema }),
  z.strictObject({ operation: z.literal('save'), ...existing, values: pageValuesSchema }),
  z.strictObject({ operation: z.literal('publish'), ...existing }),
  z.strictObject({ operation: z.literal('unpublish'), ...existing }),
])
export type PageDocument = z.infer<typeof pageDocumentSchema>
export type PageValues = z.infer<typeof pageValuesSchema>
export type PageWrite = z.infer<typeof pageWriteSchema>

export const pageRecordSchema = z.object({
  ...pageValuesSchema.shape,
  id: z.uuid(), status: z.enum(['draft', 'published']), revision: z.uuid(),
  created_at: z.string(), updated_at: z.string(),
  created_by: z.uuid().nullable(), updated_by: z.uuid().nullable(),
  published_at: z.string().nullable(), published_by: z.uuid().nullable(),
})
export const pageSnapshotSchema = z.object({
  ...pageValuesSchema.shape,
  page_id: z.uuid(), revision: z.uuid(), published_at: z.string(),
})
export type Page = z.infer<typeof pageRecordSchema>
export type PageSnapshot = z.infer<typeof pageSnapshotSchema>
