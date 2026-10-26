const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** Shared scheme policy; preserve URL normalization for existing public content. */
export function parseAllowedLinkUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return ALLOWED_LINK_PROTOCOLS.has(url.protocol) ? url : null
  } catch {
    return null
  }
}
