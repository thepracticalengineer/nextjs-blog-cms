import 'server-only'
import { isCoverImageAllowed } from '@/lib/cover-images'
import type { PageDocument } from './document'

/** Call only after structural validation; deployment host configuration stays server-only. */
export function pageDocumentImagesAllowed(document: PageDocument): boolean {
  if (document.version === 1) return true
  const nodes = [document.content]
  while (nodes.length) {
    const node = nodes.pop()!
    if (node.type === 'image' && !isCoverImageAllowed(node.attrs?.src)) return false
    if (node.content) nodes.push(...node.content)
  }
  return true
}
