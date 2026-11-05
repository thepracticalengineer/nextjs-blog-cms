import type { PageDocument, PageNode } from './document'

/**
 * Starter layouts mark copy and destinations that must be replaced before a page
 * can be published. The same markers are enforced by
 * `pages_private.publishable_document` under the page lock, so a direct RPC call
 * cannot publish template placeholder copy either.
 *
 * - Text, button labels: contain `[[Replace` (ASCII, case-insensitive).
 * - Button and link destinations: start with `#replace-link` (case-insensitive).
 */
export const placeholderTextMarker = '[[replace'
export const placeholderHref = '#replace-link'

export function isPlaceholderText(value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase().includes(placeholderTextMarker)
}
export function isPlaceholderHref(value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase().startsWith(placeholderHref)
}

/** True when any starter placeholder remains. Version 1 documents use the text rule only. */
export function hasPagePlaceholders(document: PageDocument): boolean {
  if (document.version === 1) return document.blocks.some(block => isPlaceholderText(block.text))
  const stack: PageNode[] = [document.content]
  while (stack.length) {
    const node = stack.pop()!
    if (node.type === 'text' && (isPlaceholderText(node.text) || node.marks?.some(mark => mark.type === 'link' && isPlaceholderHref(mark.attrs?.href)))) return true
    if (node.type === 'button' && (isPlaceholderText(node.attrs?.label) || isPlaceholderHref(node.attrs?.href))) return true
    if (node.content) stack.push(...node.content)
  }
  return false
}
