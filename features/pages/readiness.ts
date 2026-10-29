import { pageValuesSchema, type PageValues } from './schema'
import type { PageNode } from './document'

/** Page-specific requirements: no article word count or excerpt requirement. */
export function pageReadiness(values: PageValues): string[] {
  const issues: string[] = []
  if (!pageValuesSchema.safeParse(values).success) issues.push('Enter a title, a valid lowercase URL slug and valid page blocks within the field limits.')
  let meaningful = false
  let missingAlt = false
  function visit(node: PageNode) {
    if (node.type === 'text' && node.text?.trim()) meaningful = true
    if (node.type === 'image') {
      meaningful = true
      if (typeof node.attrs?.alt !== 'string' || !node.attrs.alt.trim()) missingAlt = true
    }
    node.content?.forEach(visit)
  }
  if (values.document.version === 1) meaningful = values.document.blocks.some(block => block.text.trim())
  else visit(values.document.content)
  if (!meaningful) issues.push('Add meaningful text or an image before publishing.')
  if (missingAlt) issues.push('Add alternative text to every page image before publishing.')
  // Empty SEO fields deliberately fall back to the page title / no description.
  return issues
}
