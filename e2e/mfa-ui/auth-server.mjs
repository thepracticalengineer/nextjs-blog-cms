import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

// No external connections or persisted accounts. Browser tests intercept failures.
const factors = ['Phone', 'Backup'].map((name, index) => ({ id: `00000000-0000-0000-0000-00000000010${index}`, friendly_name: name, factor_type: 'totp', status: 'verified', created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z' }))
const user = { id: '00000000-0000-0000-0000-000000000107', aud: 'authenticated', role: 'authenticated', email: 'mfa@disposable.test', app_metadata: {}, user_metadata: { full_name: 'MFA Test' }, factors }
const profile = { ...user, full_name: 'MFA Test', role: 'author', avatar_url: null, bio: null, website: null, github_url: null, twitter_url: null, linkedin_url: null }
createServer((request, response) => {
  response.setHeader('X-Supabase-Api-Version', '2024-01-01')
  response.setHeader('Access-Control-Expose-Headers', 'X-Supabase-Api-Version')
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3107')
  response.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
  const path = new URL(request.url, 'http://127.0.0.1').pathname
  const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
  if (path === '/auth/v1/settings') return send(200, { external: {} })
  let claims = {}
  try { claims = JSON.parse(Buffer.from(request.headers.authorization.split(' ')[1].split('.')[1], 'base64url').toString()) } catch { /* anonymous */ }
  if (path === '/auth/v1/user') return claims.sub ? send(200, user) : send(401, { code: 'session_not_found', message: 'No synthetic session' })
  if (path === '/auth/v1/logout') { response.writeHead(204); response.end(); return }
  if (!claims.sub && path.startsWith('/auth/')) return send(401, { code: 'session_not_found', message: 'No synthetic session' })
  if (path.endsWith('/challenge')) return send(200, { id: randomUUID(), expires_at: Math.floor(Date.now() / 1000) + 300 })
  if (path.endsWith('/verify')) {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const access_token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp, aal: 'aal2', amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }] })).toString('base64url')}.synthetic-signature`
    return send(200, { access_token, refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer', user })
  }
  if (path === '/rest/v1/profiles') return send(200, profile)
  return send(200, [])
}).listen(54997, '127.0.0.1')
