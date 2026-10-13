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
    if (claims.outage) return send(503, { message: 'Synthetic outage' })
    if (!claims.sub) return send(401, { message: 'Missing synthetic session' })
    response.writeHead(204); response.end(); return
  }
  if (path === '/auth/v1/token') return send(503, { message: 'Synthetic refresh outage' })
  if (path === '/auth/v1/user') return claims.sub ? send(200, user) : send(401, { message: 'No session' })
  if (path === '/rest/v1/profiles') return send(200, profile)
  return send(200, [])
}).listen(54998, '127.0.0.1')
