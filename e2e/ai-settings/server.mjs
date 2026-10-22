import { createServer } from 'node:http'

// Synthetic loopback Auth/Data API only. Nothing connects to an external account.
const origin = 'http://127.0.0.1:3111'
const id = '00000000-0000-0000-0000-000000000111'
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'settings@disposable.test', app_metadata: {}, user_metadata: { full_name: 'Settings Test' }, factors: [] }
const profile = { id, email: user.email, full_name: 'Settings Test', role: 'author', avatar_url: null, bio: null }
let keys = []
let failLoads = 0
let writes = 0
let onboardingOutage = false

function send(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(data))
}
function empty(response, status) {
  response.writeHead(status)
  response.end()
}
async function readBody(request) {
  let body = ''
  for await (const chunk of request) body += chunk
  return body ? JSON.parse(body) : {}
}
function setHeaders(response) {
  response.setHeader('X-Supabase-Api-Version', '2024-01-01')
  response.setHeader('Access-Control-Expose-Headers', 'X-Supabase-Api-Version')
  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
}
async function handleControl(request, response, path) {
  if (path === '/__control' && request.method === 'POST') {
    const data = await readBody(request)
    keys = []; writes = 0; failLoads = data.failLoads ?? 0; onboardingOutage = data.onboardingOutage ?? false
    send(response, 200, { reset: true })
    return true
  }
  if (path === '/__state') {
    send(response, 200, { keys, writes })
    return true
  }
  return false
}
function authenticated(request) {
  try {
    const token = request.headers.authorization.split(' ')[1]
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    return Boolean(claims.sub)
  } catch { return false }
}
async function upsertProvider(request, response) {
  const body = await readBody(request)
  if (body.user_id !== id) return send(response, 403, { message: 'Owner mismatch' })
  keys = [...keys.filter(record => record.provider !== body.provider), body]
  writes++
  empty(response, 201)
}
function readProviders(response, url) {
  if (failLoads > 0) {
    failLoads--
    return send(response, 400, { message: 'Synthetic settings outage' })
  }
  const columns = (url.searchParams.get('select') ?? '').split(',').map(column => column.trim())
  const selected = keys.map(record => Object.fromEntries(columns.map(column => [column, record[column]])))
  send(response, 200, selected)
}
function removeProvider(response, url) {
  keys = keys.filter(record => `eq.${record.provider}` !== url.searchParams.get('provider'))
  writes++
  empty(response, 204)
}
async function handleProviders(request, response, url) {
  if (request.method === 'POST') return upsertProvider(request, response)
  if (url.searchParams.get('user_id') !== `eq.${id}`) return send(response, 403, { message: 'Owner filter required by fixture' })
  if (request.method === 'GET') return readProviders(response, url)
  if (request.method === 'DELETE') return removeProvider(response, url)
  send(response, 405, { message: 'Unexpected fixture mutation' })
}
async function handleRequest(request, response) {
  setHeaders(response)
  if (request.method === 'OPTIONS') return empty(response, 204)
  const url = new URL(request.url, 'http://127.0.0.1')
  if (await handleControl(request, response, url.pathname)) return
  if (url.pathname === '/auth/v1/settings') return send(response, 200, { external: {} })
  if (!authenticated(request)) return send(response, 401, { code: 'session_not_found', message: 'No synthetic session' })
  if (url.pathname === '/auth/v1/user') return send(response, 200, { ...user, app_metadata: { onboarding_pending: onboardingOutage } })
  // This fixture models an established account exempt from new-user setup.
  if (url.pathname === '/rest/v1/onboarding_progress') return onboardingOutage ? send(response, 503, { message: 'Synthetic onboarding outage' }) : send(response, 200, [])
  if (url.pathname === '/rest/v1/profiles') return send(response, 200, profile)
  if (url.pathname === '/rest/v1/llm_provider_keys') return handleProviders(request, response, url)
  send(response, 404, { message: `Unsupported synthetic request: ${request.method} ${url.pathname}` })
}
createServer(handleRequest).listen(54994, '127.0.0.1')
