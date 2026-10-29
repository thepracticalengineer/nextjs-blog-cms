/** Normalize presentational website attributes before Tiptap parses a clipboard slice.
 * The document guard still validates URLs, layout settings, structure and size.
 */
export function normalizePageClipboardHTML(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  for (const link of document.querySelectorAll('a')) {
    link.removeAttribute('class')
    const target = link.getAttribute('target')
    if (target !== '_blank' && target !== '_self') link.removeAttribute('target')
    const nofollow = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes('nofollow')
    link.setAttribute('rel', nofollow ? 'noopener noreferrer nofollow' : 'noopener noreferrer')
  }
  for (const list of document.querySelectorAll('ol')) {
    list.removeAttribute('type')
    const start = positiveInteger(list.getAttribute('start'), 2147483647)
    if (start === null) list.removeAttribute('start')
    else list.setAttribute('start', String(start))
  }
  for (const image of document.querySelectorAll('img')) {
    for (const key of ['width', 'height']) {
      const value = positiveInteger(image.getAttribute(key), 10000)
      if (value === null) image.removeAttribute(key)
      else image.setAttribute(key, String(value))
    }
  }
  return document.body.innerHTML
}

function positiveInteger(value: string | null, maximum: number): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 && number <= maximum ? number : null
}
