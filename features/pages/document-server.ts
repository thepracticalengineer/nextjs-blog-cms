import 'server-only'
import { isCoverImageAllowed } from '@/lib/cover-images'
import type { PageDocument, PageNode } from './document'
import type { PageImageIssue } from './errors'

/** Call only after structural validation; deployment host configuration stays server-only. */
export function findDisallowedPageImage(document: PageDocument): PageImageIssue | null {
  if (document.version === 1) return null
  const nodes: { node: PageNode; path: number[] }[] = [{ node: document.content, path: [] }]
  while (nodes.length) {
    const { node, path } = nodes.pop()!
    if (node.type === 'image' && !isCoverImageAllowed(node.attrs?.src)) return { src: node.attrs!.src as string, path }
    // Reverse push order returns the first offending image in document order.
    for (let index = (node.content?.length ?? 0) - 1; index >= 0; index--) {
      nodes.push({ node: node.content![index], path: [...path, index] })
    }
  }
  return null
}

export function pageDocumentImagesAllowed(document: PageDocument): boolean {
  return findDisallowedPageImage(document) === null
}
