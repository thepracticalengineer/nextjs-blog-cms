import { z } from 'zod'
import { isPageSlug } from './urls'
import { pageDocumentSchema } from './document'
export { pageDocumentSchema } from './document'

// Installed Zod and PostgreSQL both count Unicode code points.
const text = (maximum: number) => z.string().max(maximum)
  .refine(value => value.isWellFormed() && !value.includes(String.fromCharCode(0)), 'Text must be valid PostgreSQL Unicode')

const storedSlug = z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const pageValuesSchema = z.strictObject({
  title: text(200).refine(value => value.trim().length > 0),
  slug: storedSlug.refine(isPageSlug, 'This URL is reserved'),
  seo_title: text(200),
  seo_description: text(500),
  document: pageDocumentSchema,
})
// Historical pending writes must remain parseable after namespace additions.
// SQL checks reservations only after finding an exact retry receipt.
const requestValuesSchema = pageValuesSchema.extend({ slug: storedSlug })
const requestKey = text(200).refine(value => value.trim().length > 0)
const existing = { pageId: z.uuid(), expectedRevision: z.uuid(), requestKey }
export const pageWriteSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('create'), requestKey, values: requestValuesSchema }),
  z.strictObject({ operation: z.literal('save'), ...existing, values: requestValuesSchema }),
  z.strictObject({ operation: z.literal('publish'), ...existing, reviewed: z.literal(true), confirmUrlChange: z.boolean().optional() }),
  z.strictObject({ operation: z.literal('unpublish'), ...existing }),
  // Copies a stored revision into the working copy only; publication stays separate.
  z.strictObject({ operation: z.literal('restore'), ...existing, sourceRevision: z.uuid() }),
])
export type PageDocument = z.infer<typeof pageDocumentSchema>
export type PageValues = z.infer<typeof pageValuesSchema>
export type PageWrite = z.infer<typeof pageWriteSchema>

export const pageRecordSchema = z.object({
  ...pageValuesSchema.shape,
  // Legacy reserved-name drafts must remain readable so an admin can rename them.
  slug: storedSlug,
  id: z.uuid(), status: z.enum(['draft', 'published']), revision: z.uuid(),
  created_at: z.string(), updated_at: z.string(),
  created_by: z.uuid().nullable(), updated_by: z.uuid().nullable(),
  published_at: z.string().nullable(), published_by: z.uuid().nullable(),
  published_slug: z.string().nullable().optional(),
})
export const pageSnapshotSchema = z.object({
  ...pageValuesSchema.shape,
  page_id: z.uuid(), revision: z.uuid(), published_at: z.string(),
})
export const pageRevisionOperations = ['baseline', 'create', 'save', 'publish', 'unpublish', 'restore'] as const
const revisionMeta = {
  id: z.uuid(), revision: z.uuid(), operation: z.enum(pageRevisionOperations),
  status: z.enum(['draft', 'published']), restored_from: z.uuid().nullable(),
  created_by: z.uuid().nullable(), created_at: z.string(),
}
export const pageRevisionSummarySchema = z.object({
  ...revisionMeta, title: z.string(), slug: z.string(), author_name: z.string().nullable(),
})
export const pageRevisionSchema = z.object({
  ...pageValuesSchema.shape,
  // Stored history keeps whatever slug was valid when it was written.
  slug: storedSlug,
  ...revisionMeta, page_id: z.uuid(),
})
export type PageRevisionSummary = z.infer<typeof pageRevisionSummarySchema>
export type PageRevision = z.infer<typeof pageRevisionSchema>
export type Page = z.infer<typeof pageRecordSchema>
export type PageSnapshot = z.infer<typeof pageSnapshotSchema>

/**
 * Section patterns are saved block sequences that are always inserted as
 * independent copies: a page never references a pattern after insertion.
 * The document uses the same versioned page schema and limits as a page, and is
 * restricted to version 2 with one to 100 top-level blocks.
 */
export const pagePatternLimits = { name: 120, description: 500, blocks: 100, library: 200 } as const
export const pagePatternDocumentSchema = pageDocumentSchema.refine(
  (document): document is Extract<PageDocument, { version: 2 }> => document.version === 2
    && Array.isArray(document.content.content)
    && document.content.content.length >= 1 && document.content.content.length <= pagePatternLimits.blocks,
  'A pattern contains one to 100 version 2 blocks',
)
export const pagePatternValuesSchema = z.strictObject({
  name: text(pagePatternLimits.name).refine(value => value.trim().length > 0),
  description: text(pagePatternLimits.description),
  document: pagePatternDocumentSchema,
})
const patternExisting = { patternId: z.uuid(), expectedRevision: z.uuid(), requestKey }
export const pagePatternWriteSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('create'), requestKey, values: pagePatternValuesSchema }),
  z.strictObject({ operation: z.literal('update'), ...patternExisting, values: pagePatternValuesSchema }),
  z.strictObject({ operation: z.literal('delete'), ...patternExisting }),
])
const patternMeta = {
  id: z.uuid(), revision: z.uuid(), name: z.string(), description: z.string(),
  created_at: z.string(), updated_at: z.string(),
  created_by: z.uuid().nullable(), updated_by: z.uuid().nullable(),
}
/** Stored rows are parsed loosely first so an unsupported document is reported, not hidden. */
export const pagePatternRowSchema = z.object({ ...patternMeta, document: z.unknown() })
export const pagePatternSchema = z.object({ ...patternMeta, ...pagePatternValuesSchema.shape })
export type PagePatternValues = z.infer<typeof pagePatternValuesSchema>
export type PagePatternWrite = z.infer<typeof pagePatternWriteSchema>
export type PagePattern = z.infer<typeof pagePatternSchema>
export type UnavailablePagePattern = z.infer<typeof pagePatternRowSchema> & { reason: 'PAGE_PATTERN_UNSUPPORTED' | 'PAGE_IMAGE_NOT_ALLOWED' }
export type PagePatternLibrary = { patterns: PagePattern[]; unavailable: Omit<UnavailablePagePattern, 'document'>[] }
