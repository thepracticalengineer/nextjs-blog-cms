interface TipTapMark {
  type: string
  attrs?: Record<string, string | number | boolean | null>
}

interface TipTapNode {
  type: string
  attrs?: Record<string, string | number | boolean | null>
  content?: TipTapNode[]
  marks?: TipTapMark[]
  text?: string
}

function sanitizeLineHeight(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const n = parseFloat(String(value))
  if (isNaN(n) || n < 0.5 || n > 10) return null
  return String(n)
}
const ALLOWED_ALIGNS = ['left', 'center', 'right', 'justify']
const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:']
const ALLOWED_SRC_PROTOCOLS = ['http:', 'https:']

function sanitizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) return value
  if (/^rgba?\(\d{1,3},\s*\d{1,3},\s*\d{1,3}(,\s*[\d.]+)?\)$/.test(value)) return value  // anchored: ^ and $ prevent CSS injection
  return null
}

function sanitizeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null
  try {
    const url = new URL(href)
    return ALLOWED_LINK_PROTOCOLS.includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function sanitizeSrc(src: unknown): string | null {
  if (typeof src !== 'string') return null
  try {
    const url = new URL(src)
    return ALLOWED_SRC_PROTOCOLS.includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function renderMark(mark: TipTapMark, inner: string): string {
  switch (mark.type) {
    case 'bold': return `<strong>${inner}</strong>`
    case 'italic': return `<em>${inner}</em>`
    case 'strike': return `<s>${inner}</s>`
    case 'underline': return `<u>${inner}</u>`
    case 'subscript': return `<sub>${inner}</sub>`
    case 'superscript': return `<sup>${inner}</sup>`
    case 'code': return `<code style="background:#1e1e2e;color:#cdd6f4;padding:2px 6px;border-radius:4px;font-size:0.875em;font-family:monospace">${inner}</code>`
    case 'textStyle': {
      const color = sanitizeColor(mark.attrs?.color)
      return color ? `<span style="color: ${color}">${inner}</span>` : inner
    }
    case 'highlight': {
      const color = sanitizeColor(mark.attrs?.color)
      return color ? `<mark style="background-color: ${color}">${inner}</mark>` : `<mark>${inner}</mark>`
    }
    case 'link': {
      const href = sanitizeHref(mark.attrs?.href)
      if (!href) return inner
      const safeHref = href.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
      return `<a href="${safeHref}" rel="noopener noreferrer" class="text-primary underline">${inner}</a>`
    }
    default: return inner
  }
}

function renderNode(node: TipTapNode): string {
  if (node.type === 'text') {
    let text = (node.text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    if (node.marks) {
      for (const mark of node.marks) {
        text = renderMark(mark, text)
      }
    }
    return text
  }

  const inner = node.content?.map(renderNode).join('') ?? ''

  switch (node.type) {
    case 'doc': return inner
    case 'paragraph': {
      const parts: string[] = []
      const lh = node.attrs?.lineHeight
      const safeLh = sanitizeLineHeight(lh)
      if (safeLh) parts.push(`line-height:${safeLh}`)
      const align = node.attrs?.textAlign
      if (align && ALLOWED_ALIGNS.includes(String(align))) parts.push(`text-align: ${align}`)
      const style = parts.length ? ` style="${parts.join('; ')}"` : ''
      return `<p${style}>${inner}</p>`
    }
    case 'hardBreak': return '<br />'
    case 'horizontalRule': return '<hr />'
    case 'heading': {
      const rawLevel = Number(node.attrs?.level)
      const level = Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 6 ? rawLevel : 2
      const parts: string[] = []
      const lh = node.attrs?.lineHeight
      const safeLh = sanitizeLineHeight(lh)
      if (safeLh) parts.push(`line-height:${safeLh}`)
      const align = node.attrs?.textAlign
      if (align && ALLOWED_ALIGNS.includes(String(align))) parts.push(`text-align: ${align}`)
      const style = parts.length ? ` style="${parts.join('; ')}"` : ''
      return `<h${level}${style}>${inner}</h${level}>`
    }
    case 'bulletList': return `<ul class="list-disc pl-6">${inner}</ul>`
    case 'orderedList': return `<ol class="list-decimal pl-6">${inner}</ol>`
    case 'listItem': return `<li>${inner}</li>`
    case 'taskList': return `<ul class="list-none pl-0 my-2">${inner}</ul>`
    case 'taskItem': {
      const checked = node.attrs?.checked === true ? ' checked' : ''
      return `<li class="flex items-start gap-2 my-1"><input type="checkbox" disabled${checked} class="mt-1"> <div>${inner}</div></li>`
    }
    case 'blockquote': return `<blockquote>${inner}</blockquote>`
    case 'codeBlock': return `<pre style="background:#1e1e2e;color:#cdd6f4;padding:1rem;border-radius:6px;margin:1rem 0;overflow-x:auto;font-family:monospace;font-size:0.875em"><code style="background:transparent;color:inherit;padding:0">${inner}</code></pre>`
    case 'table': return `<table class="border-collapse w-full my-4"><tbody>${inner}</tbody></table>`
    case 'tableRow': return `<tr>${inner}</tr>`
    case 'tableHeader': return `<th class="border border-border px-3 py-2 bg-muted font-semibold text-left">${inner}</th>`
    case 'tableCell': return `<td class="border border-border px-3 py-2">${inner}</td>`
    case 'image': {
      const src = sanitizeSrc(node.attrs?.src)
      if (!src) return ''
      const safeSrc = src.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
      const safeAlt = String(node.attrs?.alt ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
      return `<img src="${safeSrc}" alt="${safeAlt}" class="max-w-full rounded-sm my-4" />`
    }
    default: return inner
  }
}

interface EditorContentProps {
  readonly content: string
  readonly className?: string
}

export function EditorContent({ content, className }: EditorContentProps) {
  if (!content) return null

  let html = ''
  try {
    const json: TipTapNode = JSON.parse(content)
    html = renderNode(json)
  } catch {
    html = content
  }

  return (
    <div
      className={`prose prose-sm sm:prose-base lg:prose-lg max-w-none ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
