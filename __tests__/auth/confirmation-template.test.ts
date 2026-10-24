// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { signupCallbackUrl } from '@/lib/auth/confirmation'

describe('deployed signup email contract', () => {
 for (const token of ['signed-return-token', '']) {
  it.each([signupCallbackUrl, () => 'https://cms.example.com', () => 'https://preview.example.com/arbitrary?next=untrusted'])(`renders canonical links with ${token ? 'a signed return' : 'no return parameter'} despite RedirectTo (%s)`, redirect => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cms.example.com')
    try {
      const template = readFileSync('supabase/templates/confirm.html', 'utf8')
      expect(template).toContain('{{ if .Data.signup_return }}&amp;return={{ .Data.signup_return }}{{ end }}')
      const conditional = template.replace(/{{ if \.Data\.signup_return }}([\s\S]*?){{ end }}/g, (_, content) => token ? content : '')
      const rendered = conditional.replaceAll('{{ .RedirectTo }}', redirect())
        .replaceAll('{{ .Data.signup_return }}', token)
        .replaceAll('{{ .TokenHash }}', 'synthetic-hash').replaceAll('{{ .SiteURL }}', 'https://cms.example.com')
      const links = [...rendered.matchAll(/href="([^"]+)"/g)].map(match => new URL(match[1].replaceAll('&amp;', '&')))
      const confirmations = links.filter(link => link.searchParams.has('token_hash'))
      expect(confirmations).toHaveLength(2)
      for (const link of confirmations) {
        expect(link.origin).toBe('https://cms.example.com')
        expect(link.pathname).toBe('/auth/callback')
        expect([...link.searchParams]).toEqual([['type', 'signup'], ['token_hash', 'synthetic-hash'], ...(token ? [['return', token]] : [])])
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
 }
})
