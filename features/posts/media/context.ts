export type MediaContext = 'post' | 'page'

/** Query-only context is resolved before authorization; ambiguous values fail closed. */
export function mediaContext(request: Request): MediaContext | null {
  const values = new URL(request.url).searchParams.getAll('context')
  if (!values.length) return 'post'
  return values.length === 1 && (values[0] === 'post' || values[0] === 'page') ? values[0] : null
}

export function mediaContextUrl(url: string, context: MediaContext): string {
  if (context === 'post') return url
  return `${url}${url.includes('?') ? '&' : '?'}context=${encodeURIComponent(context)}`
}
