import type { PageDocument, PageDocumentV2, PageNode } from './document'
import { placeholderHref } from './placeholders'

/**
 * Accessible starter layouts built only from the supported version 2 block
 * schema. The page title renders as the public h1, so layouts start at h2 and
 * never skip a heading level. Placeholder copy is marked with `[[Replace: …]]`
 * and placeholder destinations with `#replace-link`; publication is refused
 * until every marker is replaced. Applying a layout only changes unsaved editor
 * input: the page is created as a private draft by the normal Save Draft flow.
 *
 * The Contact layout lists contact details and links only. It deliberately has
 * no form: a submission/email backend needs its own scoped feature.
 */
export const starterLayoutIds = ['about', 'contact', 'landing'] as const
export type StarterLayoutId = typeof starterLayoutIds[number]
export type StarterLayout = {
  id: StarterLayoutId
  name: string
  description: string
  /** Suggested only when the page title/slug are still empty. */
  title: string
  slug: string
  document: PageDocumentV2
}

const text = (value: string): PageNode => ({ type: 'text', text: value })
const paragraph = (value: string): PageNode => ({ type: 'paragraph', content: [text(value)] })
const heading = (level: 2 | 3, value: string): PageNode => ({ type: 'heading', attrs: { level }, content: [text(value)] })
const list = (...items: string[]): PageNode => ({ type: 'bulletList', content: items.map(item => ({ type: 'listItem', content: [paragraph(item)] })) })
const button = (label: string, href: string, variant: 'solid' | 'outline' = 'solid', align: 'left' | 'center' | 'right' = 'left'): PageNode => ({ type: 'button', attrs: { label, href, variant, align } })
const column = (...content: PageNode[]): PageNode => ({ type: 'column', content })
const doc = (...content: PageNode[]): PageDocumentV2 => ({ version: 2, content: { type: 'doc', content } })

const layouts: Record<StarterLayoutId, StarterLayout> = {
  about: {
    id: 'about', name: 'About', title: 'About', slug: 'about',
    description: 'Introduction, story and values, with a link to your contact page.',
    document: doc(
      { type: 'section', attrs: { background: 'muted', padding: 'lg', align: 'center' }, content: [
        heading(2, '[[Replace: A one-sentence summary of who you are]]'),
        paragraph('[[Replace: Introduce your organization, what you do and who you do it for.]]'),
      ] },
      { type: 'columns', attrs: { preset: 'equal-two', gap: 'lg' }, content: [
        column(heading(3, 'Our story'), paragraph('[[Replace: How and why you started, and what has changed since.]]')),
        column(heading(3, 'What we value'), list('[[Replace: First value]]', '[[Replace: Second value]]', '[[Replace: Third value]]')),
      ] },
      { type: 'section', attrs: { width: 'content' }, content: [
        heading(2, 'Get in touch'),
        paragraph('[[Replace: Invite readers to contact you, and say what they can expect.]]'),
        button('Contact us', '/contact', 'outline'),
      ] },
    ),
  },
  contact: {
    id: 'contact', name: 'Contact', title: 'Contact', slug: 'contact',
    description: 'Contact details and response expectations. Lists ways to reach you; it has no form.',
    document: doc(
      { type: 'section', attrs: { width: 'content', padding: 'lg' }, content: [
        heading(2, 'How to reach us'),
        paragraph('[[Replace: Tell visitors the best way to contact you and how quickly you usually reply.]]'),
      ] },
      { type: 'columns', attrs: { preset: 'equal-two', gap: 'lg' }, content: [
        column(heading(3, 'Email'), paragraph('[[Replace: your public email address]]'), button('Send an email', placeholderHref)),
        column(heading(3, 'Elsewhere'), list('[[Replace: Social profile or community link]]', '[[Replace: Office hours or postal address]]')),
      ] },
      { type: 'section', attrs: { background: 'muted', width: 'content' }, content: [
        heading(2, 'Before you write'),
        paragraph('[[Replace: Answers to common questions, or what to include in a message.]]'),
      ] },
    ),
  },
  landing: {
    id: 'landing', name: 'Landing page', title: 'Welcome', slug: 'welcome',
    description: 'Headline with a call to action, three benefits, a highlight and a closing call to action.',
    document: doc(
      { type: 'section', attrs: { width: 'full', background: 'accent', padding: 'lg', align: 'center' }, content: [
        heading(2, '[[Replace: A clear headline about the value you offer]]'),
        paragraph('[[Replace: One or two sentences that explain who this is for and why it matters.]]'),
        button('[[Replace: Primary action]]', placeholderHref, 'solid', 'center'),
      ] },
      { type: 'columns', attrs: { preset: 'equal-three', gap: 'lg' }, content: [
        column(heading(3, '[[Replace: First benefit]]'), paragraph('[[Replace: Describe the benefit in a sentence.]]')),
        column(heading(3, '[[Replace: Second benefit]]'), paragraph('[[Replace: Describe the benefit in a sentence.]]')),
        column(heading(3, '[[Replace: Third benefit]]'), paragraph('[[Replace: Describe the benefit in a sentence.]]')),
      ] },
      { type: 'section', attrs: { background: 'muted', padding: 'lg' }, content: [
        heading(2, '[[Replace: A highlight, result or testimonial heading]]'),
        { type: 'blockquote', content: [paragraph('[[Replace: A short quote or key detail, with its source.]]')] },
      ] },
      { type: 'section', attrs: { align: 'center', width: 'content' }, content: [
        heading(2, '[[Replace: Closing call to action]]'),
        button('[[Replace: Primary action]]', placeholderHref, 'solid', 'center'),
      ] },
    ),
  },
}

export const starterLayouts: readonly StarterLayout[] = starterLayoutIds.map(id => layouts[id])

/** A fresh deep copy: editing an applied layout never mutates the shared definition. */
export function starterLayoutDocument(id: StarterLayoutId): PageDocumentV2 {
  return structuredClone(layouts[id].document)
}

/** True when a document has no text, image or button, so a layout can replace it without losing work. */
export function isBlankPageDocument(document: PageDocument): boolean {
  if (document.version === 1) return document.blocks.every(block => !block.text.trim())
  const stack: PageNode[] = [document.content]
  while (stack.length) {
    const node = stack.pop()!
    if ((node.type === 'text' && node.text?.trim()) || node.type === 'image' || node.type === 'button') return false
    if (node.content) stack.push(...node.content)
  }
  return true
}
