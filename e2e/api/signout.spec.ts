import { test, expect, request as apiRequest } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { randomUUID } from 'node:crypto'
import { assertDedicatedTestProject } from '../environment'

// Real Auth scope semantics; run only against the main dedicated E2E stack.
for (const scope of ['local', 'global'] as const) {
  test(`logout ${scope} clears app access and ${scope === 'local' ? 'preserves' : 'revokes'} the other session`, async ({ baseURL }) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    assertDedicatedTestProject(url, process.env.E2E_SUPABASE_PROJECT_REF)
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const email = `logout-${randomUUID()}@playwright.local`
    const password = `Disposable-${randomUUID()}`
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true })
    expect(created.error).toBeNull()
    const id = created.data.user!.id
    const jar = new Map<string, string>()
    const current = createServerClient(url, anonKey, { cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: updates => updates.forEach(({ name, value }) => { if (value) jar.set(name, value); else jar.delete(name) }),
    } })
    const other = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    let browser: Awaited<ReturnType<typeof apiRequest.newContext>> | undefined
    try {
      expect((await current.auth.signInWithPassword({ email, password })).error).toBeNull()
      const currentRefreshToken = (await current.auth.getSession()).data.session!.refresh_token
      expect((await other.auth.signInWithPassword({ email, password })).error).toBeNull()
      browser = await apiRequest.newContext({ baseURL, storageState: { origins: [], cookies: [...jar].map(([name, value]) => ({ name, value, domain: new URL(baseURL!).hostname, path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' })) } })
      expect((await browser.get('/api/ai-assistant/books')).status()).toBe(200)
      expect((await browser.post(`/api/auth/signout?scope=${scope}`)).status()).toBe(204)
      expect((await browser.storageState()).cookies.filter(cookie => cookie.name.startsWith('sb-'))).toEqual([])
      expect((await browser.get('/api/ai-assistant/books')).status()).toBe(401)
      const dashboard = await browser.get('/dashboard', { maxRedirects: 0 })
      expect(dashboard.status()).toBe(307)
      expect(dashboard.headers().location).toContain('/login')
      const revoked = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      expect((await revoked.auth.refreshSession({ refresh_token: currentRefreshToken })).error).not.toBeNull()
      const refreshed = await other.auth.refreshSession()
      if (scope === 'local') expect(refreshed.error).toBeNull()
      else expect(refreshed.error).not.toBeNull()
    } finally {
      await browser?.dispose()
      expect((await service.auth.admin.deleteUser(id)).error).toBeNull()
    }
  })
}
