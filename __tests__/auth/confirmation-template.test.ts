// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { signupCallbackUrl } from '@/lib/auth/confirmation'

describe('deployed signup email contract', () => {
  it.each([signupCallbackUrl, () => 'https://cms.example.com', () => 'https://preview.example.com/arbitrary?next=untrusted'])('renders fixed confirmation links even when RedirectTo falls back or selects another origin (%s)', redirect => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cms.example.com')
    try {
      const template = readFileSync('supabase/templates/confirm.html', 'utf8')
      const rendered = template.replaceAll('{{ .RedirectTo }}', redirect())
        .replaceAll('{{ .TokenHash }}', 'synthetic-hash').replaceAll('{{ .SiteURL }}', 'https://cms.example.com')
      const links = [...rendered.matchAll(/href="([^"]+)"/g)].map(match => new URL(match[1].replaceAll('&amp;', '&')))
      const confirmations = links.filter(link => link.searchParams.has('token_hash'))
      expect(confirmations).toHaveLength(2)
      for (const link of confirmations) {
        expect(link.origin).toBe('https://cms.example.com')
        expect(link.pathname).toBe('/auth/callback')
        expect([...link.searchParams]).toEqual([['type', 'signup'], ['token_hash', 'synthetic-hash']])
      }
      expect(links.some(link => link.href === 'https://cms.example.com/')).toBe(true)
      expect(template).not.toMatch(/ConfirmationURL|blog\.frankmendez\.site|24 hours/)
      expect(template).toContain('one hour')
      const config = readFileSync('supabase/config.toml', 'utf8')
      expect(config).toMatch(/otp_expiry = 3600/)
      expect(config).toMatch(/max_frequency = "60s"/)
      expect(config).toContain('http://localhost:3000/auth/callback?type=signup')
      expect(config).not.toContain('"http://localhost:3000/auth/callback"')
    } finally { vi.unstubAllEnvs() }
  })
})
