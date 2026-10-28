import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PageContent } from '@/features/pages/PageContent'
import { type PageDocument, type PageNode } from '@/features/pages/document'
import { getPageLayoutProps } from '@/features/pages/layout'

const paragraph: PageNode = { type: 'paragraph', content: [{ type: 'text', text: 'Hello <world>' }] }
const render = (content: PageNode[]) => renderToStaticMarkup(<PageContent document={{ version: 2, content: { type: 'doc', content } }} />)

describe('PageContent', () => {
  it('escapes version 1 text without interpreting markup', () => {
    const html = renderToStaticMarkup(<PageContent document={{ version: 1, blocks: [{ type: 'paragraph', text: '<script>alert(1)</script>' }] }} />)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('uses bounded semantic layouts and preserves column order', () => {
    const html = render([{ type: 'section', attrs: { background: 'muted', width: 'full' }, content: [{ type: 'columns', attrs: { preset: 'wide-left' }, content: [{ type: 'column', content: [paragraph] }, { type: 'column', content: [{ type: 'button', attrs: { label: 'Read more', href: '/about', variant: 'outline', align: 'right' } }] }] }] }])
    expect(html).toContain('<section class="page-layout"')
    expect(html).toContain('data-preset="wide-left"')
    expect(html).toContain('data-background="muted"')
    expect(html).toContain('Hello &lt;world&gt;')
    expect(html).toContain('href="/about">Read more</a>')
    expect(html).not.toContain('prose')
  })

  it('renders all rich text nodes and marks', () => {
    const marked: PageNode = { type: 'text', text: 'Marked', marks: ['bold', 'italic', 'strike', 'underline', 'code'].map(type => ({ type })) }
    const html = render([
      ...[1, 2, 3, 4, 5, 6].map(level => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: `Heading ${level}` }] })),
      { type: 'paragraph', content: [marked, { type: 'hardBreak' }, { type: 'text', text: 'Link', marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank', title: 'Safe <title>' } }] }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph] }] },
      { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [paragraph] }] },
      { type: 'blockquote', content: [paragraph] }, { type: 'codeBlock', content: [{ type: 'text', text: '<safe>' }] }, { type: 'horizontalRule' },
    ])
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 's', 'u', 'code', 'ul', 'li', 'blockquote', 'pre']) expect(html).toContain(`<${tag}>`)
    expect(html).toContain('<ol start="3">')
    expect(html).toContain('<br/>')
    expect(html).toContain('<hr/>')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('title="Safe &lt;title&gt;"')
    expect(html).toContain('&lt;safe&gt;')
  })

  it('retains image metadata and dimensions', () => {
    const html = render([{ type: 'image', attrs: { src: '/images/photo.jpg', alt: 'A <photo>', width: 640, height: 480, assetId: '00000000-0000-4000-8000-000000000001' } }])
    expect(html).toContain('alt="A &lt;photo&gt;"')
    expect(html).toContain('width="640" height="480"')
    expect(html).toContain('data-asset-id="00000000-0000-4000-8000-000000000001"')
  })

  it.each([
    { version: 99 },
    { version: 2, content: { type: 'doc', content: [{ type: 'script', text: 'bad' }] } },
    { version: 2, content: { type: 'doc', content: [{ type: 'button', attrs: { label: 'Bad', href: 'javascript:alert(1)' } }] } },
    { version: 2, content: { type: 'doc', content: [{ type: 'section', attrs: { style: 'position:fixed' } }] } },
  ])('fails visibly and safely for malformed documents', document => {
    expect(renderToStaticMarkup(<PageContent document={document as PageDocument} />)).toBe('<div role="alert">This page content cannot be displayed.</div>')
  })

  it('shares bounded hooks and mobile rules with the editable canvas', () => {
    expect(getPageLayoutProps('columns', { width: 'evil', padding: '999', preset: 'evil' })).toMatchObject({ 'data-width': 'wide', 'data-padding': 'md', 'data-preset': 'equal-two' })
    const css = readFileSync('features/pages/page-layout.css', 'utf8')
    expect(css).toContain('@media (max-width: 640px)')
    expect(css).toContain('.page-canvas [data-page-block="columns"] { grid-template-columns: minmax(0, 1fr); }')
    expect(css).toContain('max-width: 100%; height: auto;')
    expect(css).not.toContain('[contenteditable="false"]')
  })
})
