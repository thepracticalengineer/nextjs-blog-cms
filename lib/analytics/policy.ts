export interface AnalyticsConfig {
  measurementId: string
  origin: string
}

export interface AnalyticsPage {
  pathname: string
  title: string
}

/** Explicit rollout switch: a measurement ID alone must never enable collection. */
export function analyticsConfig(env: Record<string, string | undefined>): AnalyticsConfig | null {
  if (env.NODE_ENV !== 'production' || env.GA_ENABLED !== 'true') return null
  if ((env.VERCEL_ENV ?? env.DEPLOYMENT_ENV) !== 'production') return null
  if (!/^G-[A-Z0-9]+$/.test(env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '')) return null
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL ?? '')
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash ||
      url.hostname === 'localhost' || url.hostname.endsWith('.vercel.app') ||
      !/[a-z]/i.test(url.hostname)) return null
    return { measurementId: env.NEXT_PUBLIC_GA_MEASUREMENT_ID!, origin: url.origin }
  } catch {
    return null
  }
}

function isPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/blog') return true
  const segments = pathname.split('/')
  if (segments[1] !== 'blog') return false
  const slug = segments.at(-1) ?? ''
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false
  return segments.length === 3 ||
    (segments.length === 4 && ['category', 'tag'].includes(segments[2]))
}
const campaignKeys = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'])

/** Unknown query keys and all fragments fail closed (including OAuth/recovery tokens). */
export function publicLocation(href: string, config: AnalyticsConfig): string | null {
  try {
    const url = new URL(href)
    if (url.origin !== config.origin || url.hash || !isPublicPath(url.pathname)) return null
    const clean = new URL(url.pathname, config.origin)
    for (const [key, value] of url.searchParams) {
      if (key === 'page' && /^[1-9]\d{0,5}$/.test(value)) clean.searchParams.set(key, value)
      // Free-text search is never transmitted. /blog currently ignores q; it is not a search result.
      else if (key === 'q') continue
      else if (campaignKeys.has(key) && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value)) clean.searchParams.set(key, value)
      else return null
    }
    return clean.href
  } catch {
    return null
  }
}

export function publicReferrer(referrer: string, config: AnalyticsConfig): string {
  try {
    const url = new URL(referrer)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return ''
    // Internal referrers are supplied from the last measured page, never private navigation.
    return url.origin === config.origin ? '' : `${url.origin}/`
  } catch {
    return ''
  }
}
