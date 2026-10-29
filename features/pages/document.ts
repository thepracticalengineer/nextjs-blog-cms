import { z } from 'zod'
import type { JSONContent } from '@tiptap/core'

export type PageNode = JSONContent & { type: string; content?: PageNode[] }
export type PageDocumentV2 = { version: 2; content: PageNode }
export const layoutOptions = {
  width: ['content', 'wide', 'full'], background: ['default', 'muted', 'accent'],
  padding: ['none', 'sm', 'md', 'lg'], gap: ['none', 'sm', 'md', 'lg'], align: ['left', 'center', 'right'],
} as const
export const layoutDefaults = { width: 'wide', background: 'default', padding: 'md', gap: 'md', align: 'left' } as const
export const columnPresets = ['one', 'equal-two', 'wide-left', 'wide-right', 'equal-three'] as const
const columnCounts = { one: 1, 'equal-two': 2, 'wide-left': 2, 'wide-right': 2, 'equal-three': 3 } as const
const text = (max: number) => z.string().max(max).refine(value => value.isWellFormed() && !value.includes('\0'))
const textNodeSchema = text(10000).min(1)
const documentEncoder = new TextEncoder()
const v1 = z.strictObject({ version: z.literal(1), blocks: z.array(z.strictObject({ type: z.literal('paragraph'), text: text(10000) })).max(500) })
export type PageDocumentV1 = z.infer<typeof v1>
export type PageDocument = PageDocumentV1 | PageDocumentV2

export function isSafePageHref(value: string): boolean {
  if (!value.length || value.length > 2048 || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return false
  if (/^\/(?!\/)/.test(value) || /^#/.test(value) || /^mailto:[^@]+@[^@]+/i.test(value)) return true
  try {
    const url = new URL(value)
    return /^https?:\/\//i.test(value) && !url.username && !url.password
  } catch { return false }
}
const href = text(2048).refine(isSafePageHref)
const layout = {
  width: z.enum(layoutOptions.width).optional(), background: z.enum(layoutOptions.background).optional(),
  padding: z.enum(layoutOptions.padding).optional(), gap: z.enum(layoutOptions.gap).optional(), align: z.enum(layoutOptions.align).optional(),
}
const emptyAttrs = z.strictObject({})
const attrSchemas = {
  doc: emptyAttrs, paragraph: emptyAttrs, text: emptyAttrs, hardBreak: emptyAttrs, horizontalRule: emptyAttrs,
  heading: z.strictObject({ level: z.number().int().min(1).max(6).optional() }),
  bulletList: emptyAttrs, listItem: emptyAttrs, blockquote: emptyAttrs,
  orderedList: z.strictObject({ start: z.number().int().min(1).max(2147483647).optional(), type: z.null().optional() }),
  codeBlock: z.strictObject({ language: text(100).nullable().optional() }),
  section: z.strictObject(layout), column: z.strictObject(layout),
  columns: z.strictObject({ ...layout, preset: z.enum(columnPresets).optional() }),
  button: z.strictObject({ label: text(200).min(1), href, variant: z.enum(['solid', 'outline']).optional(), align: z.enum(layoutOptions.align).optional() }),
  image: z.strictObject({ src: text(2048).min(1).refine(value => isSafePageHref(value) && !value.startsWith('#') && !value.startsWith('mailto:') && /^(https?:\/\/|\/)/i.test(value)), alt: text(1000).nullable().optional(), title: text(1000).nullable().optional(), width: z.number().int().min(1).max(10000).nullable().optional(), height: z.number().int().min(1).max(10000).nullable().optional(), assetId: z.uuid().nullable().optional() }),
}
const markSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.enum(['bold', 'italic', 'strike', 'underline', 'code']), attrs: emptyAttrs.optional() }),
  z.strictObject({ type: z.literal('link'), attrs: z.strictObject({ href, title: text(1000).nullable().optional(), target: z.enum(['_blank', '_self']).nullable().optional(), rel: z.enum(['noopener noreferrer nofollow', 'noopener noreferrer', 'nofollow']).nullable().optional(), class: z.null().optional() }) }),
])
const flow = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule', 'image', 'section', 'columns', 'button'])
function validV2(value: unknown): value is PageDocumentV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const wrapper = value as Record<string, unknown>
  if (wrapper.version !== 2 || Object.keys(wrapper).some(key => !['version', 'content'].includes(key))) return false
  const stack: { node: unknown; parent: string; depth: number }[] = [{ node: wrapper.content, parent: '', depth: 0 }]
  let count = 0
  while (stack.length) {
    const { node, parent, depth } = stack.pop()!
    if (++count > 1500 || depth > 12 || !node || typeof node !== 'object' || Array.isArray(node)) return false
    const n = node as Record<string, unknown>
    const type = n.type
    if (typeof type !== 'string' || !Object.hasOwn(attrSchemas, type) || Object.keys(n).some(key => !['type', 'attrs', 'content', 'text', 'marks'].includes(key))) return false
    if (!attrSchemas[type as keyof typeof attrSchemas].safeParse(n.attrs === undefined ? {} : n.attrs).success) return false
    if (!parent ? type !== 'doc' : parent === 'columns' ? type !== 'column' : ['paragraph', 'heading'].includes(parent) ? !['text', 'hardBreak'].includes(type) : parent === 'codeBlock' ? type !== 'text' : ['bulletList', 'orderedList'].includes(parent) ? type !== 'listItem' : !flow.has(type)) return false
    if (type === 'text') {
      if (!textNodeSchema.safeParse(n.text).success || n.content !== undefined) return false
    } else if (n.text !== undefined) return false
    if (n.marks !== undefined && (!['text', 'hardBreak'].includes(type) || parent === 'codeBlock' || !Array.isArray(n.marks) || n.marks.length > 6 || !n.marks.every(mark => markSchema.safeParse(mark).success) || new Set(n.marks.map(mark => mark.type)).size !== n.marks.length)) return false
    if (n.content !== undefined && !Array.isArray(n.content)) return false
    const children = (n.content || []) as unknown[]
    if (['text', 'hardBreak', 'horizontalRule', 'button', 'image'].includes(type) && n.content !== undefined) return false
    if (type === 'columns' && children.length !== columnCounts[(n.attrs as { preset?: keyof typeof columnCounts } | undefined)?.preset || 'equal-two']) return false
    if (['bulletList', 'orderedList', 'listItem', 'blockquote', 'section', 'column'].includes(type) && !children.length) return false
    if (type === 'listItem' && (children[0] as { type?: string })?.type !== 'paragraph') return false
    if (children.length > 1500 - count) return false
    for (const child of children) stack.push({ node: child, parent: type, depth: depth + 1 })
  }
  // Traversal bounds make serialization safe even for hostile cyclic input.
  try { return documentEncoder.encode(JSON.stringify(value)).length <= 256 * 1024 } catch { return false }
}
export const pageDocumentSchema = z.union([v1, z.custom<PageDocumentV2>(validV2, 'Invalid page document')])

export function toPageEditorDocument(document: PageDocument): PageNode {
  const valid = pageDocumentSchema.parse(document)
  if (valid.version === 2) return structuredClone(valid.content)
  return { type: 'doc', content: valid.blocks.map(block => ({ type: 'paragraph', ...(block.text ? { content: [{ type: 'text', text: block.text }] } : {}) })) }
}
