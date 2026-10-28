import { z } from 'zod'

export const MAX_COMMENT_LENGTH = 2000
// Keep in sync with public.normalize_comment_content in the migration.
export function normalizeCommentContent(content: string) {
  return content.replace(/\r\n?/g, '\n').trim()
}
export function commentLength(content: string) {
  return Array.from(normalizeCommentContent(content)).length
}
export const commentContentSchema = z.string().transform(normalizeCommentContent)
  .refine(content => content.length > 0, 'Comment cannot be empty')
  .refine(content => Array.from(content).length <= MAX_COMMENT_LENGTH, 'Comment must be 2,000 characters or less')
  .refine(content => !content.includes('\0') && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(content), 'Comment contains invalid characters')
