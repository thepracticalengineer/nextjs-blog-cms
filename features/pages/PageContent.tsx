import { createElement, Fragment, type ReactNode } from 'react'
import { type PageNode } from './document'
import { pageDocumentSchema, type PageDocument } from './schema'
import { getPageLayoutProps } from './layout'
import './page-layout.css'

function renderNode(node: PageNode, key: number): ReactNode {
  const attrs = node.attrs ?? {}
  const children = node.content?.map(renderNode)
  if (node.type === 'text') {
    let content: ReactNode = node.text
    for (const mark of node.marks ?? []) {
      const tags: Record<string, string> = { bold: 'strong', italic: 'em', strike: 's', underline: 'u', code: 'code' }
      content = mark.type === 'link'
        ? <a href={mark.attrs?.href as string} title={mark.attrs?.title as string | undefined} target={mark.attrs?.target as string | undefined} rel={mark.attrs?.target === '_blank' ? 'noopener noreferrer' : mark.attrs?.rel as string | undefined}>{content}</a>
        : createElement(tags[mark.type], null, content)
    }
    return <Fragment key={key}>{content}</Fragment>
  }
  switch (node.type) {
    case 'doc': return <Fragment key={key}>{children}</Fragment>
    case 'section': return <section key={key} {...getPageLayoutProps('section', attrs)}>{children}</section>
    case 'columns':
    case 'column': return <div key={key} {...getPageLayoutProps(node.type, attrs)}>{children}</div>
    case 'paragraph': return <p key={key}>{children}</p>
    case 'heading': return createElement(`h${attrs.level ?? 1}`, { key }, children)
    case 'bulletList': return <ul key={key}>{children}</ul>
    case 'orderedList': return <ol key={key} start={attrs.start as number | undefined}>{children}</ol>
    case 'listItem': return <li key={key}>{children}</li>
    case 'blockquote': return <blockquote key={key}>{children}</blockquote>
    case 'codeBlock': return <pre key={key}><code>{children}</code></pre>
    case 'horizontalRule': return <hr key={key} />
    case 'hardBreak': return <br key={key} />
    case 'button': return <div key={key} data-page-block="button" data-align={attrs.align ?? 'left'}><a className="page-button" data-variant={attrs.variant ?? 'solid'} href={attrs.href as string}>{attrs.label as string}</a></div>
    // The document validator checks image URLs; native dimensions preserve layout.
    // eslint-disable-next-line @next/next/no-img-element
    case 'image': return <img key={key} data-page-block="image" src={attrs.src as string} alt={attrs.alt as string ?? ''} title={attrs.title as string | undefined} width={attrs.width as number | undefined} height={attrs.height as number | undefined} data-asset-id={attrs.assetId as string | undefined} />
    default: return null
  }
}

/** Validate at this read boundary too: legacy/corrupt snapshots must never inject markup. */
export function PageContent({ document }: { document: PageDocument }) {
  const parsed = pageDocumentSchema.safeParse(document)
  if (!parsed.success) return <div role="alert">This page content cannot be displayed.</div>
  return <div className="page-canvas" data-page-content="">
    {parsed.data.version === 1
      ? parsed.data.blocks.map((block, index) => <p key={index}>{block.text}</p>)
      : renderNode(parsed.data.content, 0)}
  </div>
}
