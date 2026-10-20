import { createServer } from 'node:http'

// Synthetic loopback Auth/Data API only. Nothing connects to an external account.
const origin = 'http://127.0.0.1:3111'
const id = '00000000-0000-0000-0000-000000000111'
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'settings@disposable.test', app_metadata: {}, user_metadata: { full_name: 'Settings Test' }, factors: [] }
const profile = { id, email: user.email, full_name: 'Settings Test', role: 'author', avatar_url: null, bio: null }
let keys = []
let failLoads = 0
let writes = 0
createServer(async (request, response) => {
  response.setHeader('X-Supabase-Api-Version', '2024-01-01')
  response.setHeader('Access-Control-Expose-Headers', 'X-Supabase-Api-Version')
  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
  const url = new URL(request.url, 'http://127.0.0.1')
  const readBody = async () => {
    let body = ''
    for await (const chunk of request) body += chunk
    return body ? JSON.parse(body) : {}
  }
  if (url.pathname === '/__control' && request.method === 'POST') {
    const data = await readBody()
    keys = []; writes = 0; failLoads = data.failLoads ?? 0
    return send(200, { reset: true })
  }
  if (url.pathname === '/__state') return send(200, { keys, writes })
  if (url.pathname === '/auth/v1/settings') return send(200, { external: {} })
  let claims = {}
  try { claims = JSON.parse(Buffer.from(request.headers.authorization.split(' ')[1].split('.')[1], 'base64url').toString()) } catch { /* anonymous */ }
  if (!claims.sub) return send(401, { code: 'session_not_found', message: 'No synthetic session' })
  if (url.pathname === '/auth/v1/user') return send(200, user)
  if (url.pathname === '/rest/v1/profiles') return send(200, profile)
  if (url.pathname === '/rest/v1/llm_provider_keys') {
    if (request.method === 'POST') {
      const body = await readBody()
      if (body.user_id !== id) return send(403, { message: 'Owner mismatch' })
      keys = [...keys.filter(record => record.provider !== body.provider), body]
      writes++; response.writeHead(201); response.end(); return
    }
    if (url.searchParams.get('user_id') !== `eq.${id}`) return send(403, { message: 'Owner filter required by fixture' })
    if (request.method === 'GET') {
      if (failLoads > 0) { failLoads--; return send(400, { message: 'Synthetic settings outage' }) }
      const columns = (url.searchParams.get('select') ?? '').split(',').map(column => column.trim())
      return send(200, keys.map(record => Object.fromEntries(columns.map(column => [column, record[column]]))))
    }
    if (request.method === 'DELETE') {
      keys = keys.filter(record => `eq.${record.provider}` !== url.searchParams.get('provider'))
      writes++; response.writeHead(204); response.end(); return
    }
    return send(405, { message: 'Unexpected fixture mutation' })
  }
  return send(404, { message: `Unsupported synthetic request: ${request.method} ${url.pathname}` })
}).listen(54994, '127.0.0.1')
