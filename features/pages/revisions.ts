import type { PageDocument, PageNode } from './document'
import type { PageRevisionSummary, PageValues } from './schema'

export type FieldChange = { field: 'title' | 'slug' | 'seo_title' | 'seo_description'; before: string; after: string }
export type ContentLine = { kind: 'same' | 'added' | 'removed'; text: string }
export type RevisionComparison = { fields: FieldChange[]; lines: ContentLine[]; contentChanged: boolean; layoutOnly: boolean }

const fieldNames = ['title', 'slug', 'seo_title', 'seo_description'] as const
const textBlocks = new Set(['paragraph', 'heading', 'codeBlock'])
// Above this many LCS cells, fall back to an ordered membership diff.
const maxCells = 250_000

export const revisionOperationLabels: Record<PageRevisionSummary['operation'], string> = {
  baseline: 'History started', create: 'Created', save: 'Draft saved', publish: 'Published',
  unpublish: 'Unpublished', restore: 'Restored',
}

function nodeText(node: PageNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return ' '
  return (node.content ?? []).map(nodeText).join('')
}

/** Readable text per block, in document order: what an editor would compare by eye. */
export function documentLines(document: PageDocument): string[] {
  if (document.version === 1) return document.blocks.map(block => block.text.trim()).filter(Boolean)
  const lines: string[] = []
  function visit(node: PageNode) {
    if (textBlocks.has(node.type)) {
      const text = nodeText(node).trim()
      const prefix = node.type === 'heading' ? `${'#'.repeat(Number(node.attrs?.level ?? 1))} ` : ''
      if (text) lines.push(prefix + text)
      return
    }
    if (node.type === 'image') { lines.push(`[Image: ${typeof node.attrs?.alt === 'string' && node.attrs.alt.trim() ? node.attrs.alt.trim() : 'no alternative text'}]`); return }
    if (node.type === 'button') { lines.push(`[Button: ${String(node.attrs?.label ?? '')} → ${String(node.attrs?.href ?? '')}]`); return }
    if (node.type === 'horizontalRule') { lines.push('[Divider]'); return }
    node.content?.forEach(visit)
  }
  visit(document.content)
  return lines
}

export function diffLines(before: string[], after: string[]): ContentLine[] {
  if (before.length * after.length > maxCells) {
    const kept = new Set(after)
    const previous = new Set(before)
    return [...before.filter(line => !kept.has(line)).map(text => ({ kind: 'removed' as const, text })),
      ...after.map(text => ({ kind: previous.has(text) ? 'same' as const : 'added' as const, text }))]
  }
  const table = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1))
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const result: ContentLine[] = []
  let i = 0, j = 0
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) { result.push({ kind: 'same', text: before[i] }); i++; j++ }
    else if (table[i + 1][j] >= table[i][j + 1]) result.push({ kind: 'removed', text: before[i++] })
    else result.push({ kind: 'added', text: after[j++] })
  }
  while (i < before.length) result.push({ kind: 'removed', text: before[i++] })
  while (j < after.length) result.push({ kind: 'added', text: after[j++] })
  return result
}

/** Describes what restoring `target` would change relative to `current`. */
export function compareRevision(current: PageValues, target: PageValues): RevisionComparison {
  const fields = fieldNames.filter(field => current[field] !== target[field]).map(field => ({ field, before: current[field], after: target[field] }))
  const contentChanged = JSON.stringify(current.document) !== JSON.stringify(target.document)
  const lines = diffLines(documentLines(current.document), documentLines(target.document))
  const layoutOnly = contentChanged && lines.every(line => line.kind === 'same')
  return { fields, lines, contentChanged, layoutOnly }
}
