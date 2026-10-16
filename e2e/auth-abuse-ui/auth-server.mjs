import { createServer } from 'node:http'

// Loopback-only fixture. No account storage, mail, database or real provider calls.
let mode = 'normal', calls = 0, reservations = []
createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json')
  const send = (status, body) => { response.writeHead(status); response.end(JSON.stringify(body)) }
  const url = new URL(request.url, 'http://127.0.0.1')
  if (url.pathname === '/__control') {
    mode = url.searchParams.get('mode') ?? 'normal'; calls = 0; reservations = []
    return send(200, {})
  }
  if (url.pathname === '/__state') return send(200, { calls, reservations })
  if (url.pathname === '/auth/v1/settings') return send(200, { external: { google: true, github: true } })
  if (url.pathname === '/rest/v1/rpc/reserve_auth_attempt') {
    let body = ''; for await (const chunk of request) body += chunk
    reservations.push(JSON.parse(body))
    if (mode === 'outage') return send(503, { message: 'PRIVATE store error' })
    return send(200, { allowed: mode !== 'cooldown', retry_after: mode === 'cooldown' ? 2 : 0, challenge_required: false, ip_attempts: 1 })
  }
  if (url.pathname === '/rest/v1/rpc/record_auth_login_failure') return send(200, null)
  if (url.pathname === '/auth/v1/token') {
    calls++
    if (mode === 'provider429') return send(429, { code: 'over_request_rate_limit', msg: 'PRIVATE provider error' })
    return send(400, { code: 'invalid_credentials', msg: 'PRIVATE unknown account' })
  }
  return send(404, {})
}).listen(54996, '127.0.0.1')
