import { createServer } from 'node:http'

// Isolated HTTP fixture: no real Auth, database, email, webhook or provider.
const user = { id: '00000000-0000-0000-0000-000000000105', aud: 'authenticated', role: 'authenticated', email: 'logout@disposable.test', app_metadata: {}, user_metadata: { full_name: 'Logout Test' }, factors: [] }
const profile = { ...user, full_name: 'Logout Test', role: 'author', avatar_url: null, bio: null, website: null, github_url: null, twitter_url: null, linkedin_url: null }
createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3106')
  response.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
  const path = new URL(request.url, 'http://127.0.0.1').pathname
  const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Range': '0-0/0' }); response.end(JSON.stringify(data)) }
  if (path === '/auth/v1/settings') return send(200, { external: {} })
  const bearer = request.headers.authorization?.slice(7)
  let claims = {}
  try { claims = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()) } catch { /* anonymous */ }
  if (path === '/auth/v1/logout') {
    if (claims.exp <= Math.floor(Date.now() / 1000)) return send(403, { message: 'Synthetic expired session' })
    if (claims.outage) return send(503, { message: 'Synthetic outage' })
    if (!claims.sub) return send(401, { message: 'Missing synthetic session' })
    response.writeHead(204); response.end(); return
  }
  if (path === '/auth/v1/token') {
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      let token
      try { token = JSON.parse(body).refresh_token } catch { return send(400, { message: 'Invalid refresh request' }) }
      if (token === 'synthetic-refresh-outage') return send(503, { message: 'Synthetic refresh outage' })
      if (token !== 'synthetic-refresh') return send(400, { message: 'Invalid synthetic refresh token' })
      const exp = Math.floor(Date.now() / 1000) + 3600
      const access_token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp, aal: 'aal1' })).toString('base64url')}.synthetic-signature`
      return send(200, { access_token, refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer', user })
    })
    return
  }
  if (path === '/auth/v1/user') return claims.sub ? send(200, user) : send(401, { message: 'No session' })
  if (path === '/rest/v1/profiles') return send(200, profile)
  return send(200, [])
}).listen(54998, '127.0.0.1')
