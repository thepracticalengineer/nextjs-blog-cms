import { Extension, Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Plugin } from '@tiptap/pm/state'
import { pageDocumentSchema, layoutDefaults, isSafePageHref } from '../document'
import { getPageLayoutProps } from '../layout'

function layoutDOM(type: 'section' | 'columns' | 'column', attrs: Record<string, unknown>) {
  const { className, ...props } = getPageLayoutProps(type, attrs)
  return { ...props, class: className }
}

const layoutAttributes = () => Object.fromEntries(Object.entries(layoutDefaults).map(([key, value]) => [key, {
  default: value,
  parseHTML: (element: HTMLElement) => element.getAttribute(`data-${key}`) ?? value,
  rendered: false,
}]))

const Section = Node.create({
  name: 'section', group: 'block', content: 'block+', defining: true, isolating: true,
  addAttributes: layoutAttributes,
  parseHTML: () => [{ tag: 'section[data-page-block="section"]' }],
  renderHTML: ({ node }) => ['section', layoutDOM('section', node.attrs), 0],
})
const Column = Node.create({
  name: 'column', content: 'block+', defining: true, isolating: true,
  addAttributes: layoutAttributes,
  parseHTML: () => [{ tag: 'div[data-page-block="column"]' }],
  renderHTML: ({ node }) => ['div', layoutDOM('column', node.attrs), 0],
})
const Columns = Node.create({
  name: 'columns', group: 'block', content: 'column{1,3}', defining: true, isolating: true,
  addAttributes: () => ({ ...layoutAttributes(), preset: { default: 'equal-two', rendered: false, parseHTML: element => element.getAttribute('data-preset') ?? 'equal-two' } }),
  parseHTML: () => [{ tag: 'div[data-page-block="columns"]' }],
  renderHTML: ({ node }) => ['div', layoutDOM('columns', node.attrs), 0],
})
const PageButton = Node.create({
  name: 'button', group: 'block', atom: true,
  addAttributes: () => ({
    label: { default: 'Learn more', rendered: false }, href: { default: '/', rendered: false },
    variant: { default: 'solid', rendered: false }, align: { default: 'left', rendered: false },
  }),
  // Plain pasted links remain rich-text links, never implicitly become buttons.
  parseHTML: () => [],
  renderHTML: ({ node }) => ['div', { 'data-page-block': 'button', 'data-align': node.attrs.align },
    ['a', { href: node.attrs.href, 'data-variant': node.attrs.variant, tabindex: '-1' }, node.attrs.label]],
})

/** A page-only schema. Post extensions and HTML storage remain unchanged. */
export function createPageExtensions(onInvalid?: () => void) {
  return [
    StarterKit.configure({ link: false, trailingNode: false }),
    Link.configure({ openOnClick: false, autolink: false, isAllowedUri: isSafePageHref, HTMLAttributes: { rel: 'noopener noreferrer', target: null, class: null } }),
    Image.extend({
      addAttributes() {
        return { ...this.parent?.(),
          width: { default: null }, height: { default: null }, assetId: { default: null },
        }
      },
      renderHTML({ HTMLAttributes }) {
        return ['img', mergeAttributes(HTMLAttributes, { 'data-page-block': 'image' })]
      },
    }).configure({ allowBase64: false }),
    Section, Columns, Column, PageButton,
    Extension.create({
      name: 'pageDocumentGuard',
      addProseMirrorPlugins() {
        return [new Plugin({ filterTransaction(transaction) {
          if (!transaction.docChanged) return true
          const valid = pageDocumentSchema.safeParse({ version: 2, content: transaction.doc.toJSON() }).success
          if (!valid) onInvalid?.()
          return valid
        } })]
      },
    }),
  ]
}
