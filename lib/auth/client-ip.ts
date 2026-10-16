import 'server-only'
import { isIP } from 'node:net'

/** Trust only a single header overwritten by an ingress that blocks direct access. */
export function trustedClientIp(requestHeaders: Pick<Headers, 'get'>): string {
  const header = process.env.AUTH_TRUSTED_IP_HEADER?.trim().toLowerCase()
  if (!header) {
    if (process.env.NODE_ENV === 'production') throw new Error('Missing trusted ingress configuration')
    return 'unknown'
  }
  const value = requestHeaders.get(header)?.trim()
  if (!value || value.includes('%') || !isIP(value)) throw new Error('Invalid trusted client IP')
  if (isIP(value) === 4) return value
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1)
  // IPv4-mapped IPv6 must consume the same budget as its IPv4 representation.
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(normalized)
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16)
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
  }
  return normalized
}
