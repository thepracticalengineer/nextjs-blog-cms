import { describe, expect, it } from 'vitest'
import { parseAllowedLinkUrl } from '@/lib/editor-link-url'

describe('public and editor link schemes', () => {
  it.each(['https://example.com/a', 'http://example.com/', 'mailto:hello@example.com'])('allows %s', value => {
    expect(parseAllowedLinkUrl(value)?.href).toBe(value)
  })
  it.each(['', 'not a url', '/relative', '//example.com', 'javascript:alert(1)', 'data:text/html,test', 'tel:123', null, 42])('rejects %s', value => {
    expect(parseAllowedLinkUrl(value)).toBeNull()
  })
  it('preserves URL normalization used by the public renderer', () => {
    expect(parseAllowedLinkUrl('HTTPS://EXAMPLE.COM/a b')?.href).toBe('https://example.com/a%20b')
  })
})
