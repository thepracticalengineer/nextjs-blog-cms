import type { PageDocument, PageNode } from './document'
import type { PageRevisionSummary, PageValues } from './schema'

export type FieldChange = { field: 'title' | 'slug' | 'seo_title' | 'seo_description'; before: string; after: string }
export type ContentLine = { kind: 'same' | 'added' | 'removed'; text: string }
export type RevisionComparison = { fields: FieldChange[]; lines: ContentLine[]; exact: boolean; contentChanged: boolean; layoutOnly: boolean }

const fieldNames = ['title', 'slug', 'seo_title', 'seo_description'] as const
const textBlocks = new Set(['paragraph', 'heading', 'codeBlock'])
// Above this many LCS cells in the changed middle, fall back to a count-aware diff.
const maxCells = 250_000

export const revisionOperationLabels: Record<PageRevisionSummary['operation'], string> = {
  baseline: 'History started', create: 'Created', save: 'Draft saved', publish: 'Published',
  unpublish: 'Unpublished', restore: 'Restored', trash: 'Moved to trash',
  recover: 'Restored from trash', move: 'Moved', purge: 'Permanently deleted',
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

/**
 * Line diff for the history panel. Common leading/trailing lines are matched
 * first; the changed middle uses an exact LCS. When the middle is too large for
 * that, a count-aware fallback still reports every added/removed occurrence but
 * cannot place moved lines precisely, so the result is marked `exact: false`.
 */
export function diffLines(before: string[], after: string[]): { lines: ContentLine[]; exact: boolean } {
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++
  let suffix = 0
  while (suffix < before.length - prefix && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++
  const head = before.slice(0, prefix).map(text => ({ kind: 'same' as const, text }))
  const tail = before.slice(before.length - suffix).map(text => ({ kind: 'same' as const, text }))
  const left = before.slice(prefix, before.length - suffix)
  const right = after.slice(prefix, after.length - suffix)
  if (left.length * right.length > maxCells) return { lines: [...head, ...countedDiff(left, right), ...tail], exact: false }
  return { lines: [...head, ...exactDiff(left, right), ...tail], exact: true }
}

function countedDiff(before: string[], after: string[]): ContentLine[] {
  const count = (lines: string[]) => lines.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map<string, number>())
  const unmatchedAfter = count(after)
  const removed: ContentLine[] = []
  for (const text of before) {
    const left = unmatchedAfter.get(text) ?? 0
    if (left > 0) unmatchedAfter.set(text, left - 1)
    else removed.push({ kind: 'removed', text })
  }
  const unmatchedBefore = count(before)
  const rest = after.map(text => {
    const left = unmatchedBefore.get(text) ?? 0
    if (left > 0) { unmatchedBefore.set(text, left - 1); return { kind: 'same' as const, text } }
    return { kind: 'added' as const, text }
  })
  return [...removed, ...rest]
}

function exactDiff(before: string[], after: string[]): ContentLine[] {
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
  const { lines, exact } = diffLines(documentLines(current.document), documentLines(target.document))
  // Counts match exactly even in the fallback, so equal text really means layout-only.
  const layoutOnly = contentChanged && lines.every(line => line.kind === 'same')
  return { fields, lines, exact, contentChanged, layoutOnly }
}
