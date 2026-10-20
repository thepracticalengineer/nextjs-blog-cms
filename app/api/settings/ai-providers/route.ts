import { authorizeApi } from '@/lib/auth/api'
import { createClient } from '@/lib/supabase/server'
import { encryptSecret, decryptSecret } from '@/lib/encryption'
import { verifyProviderKey } from '@/features/ai/providers'
import { PROVIDERS, type LLMProvider } from '@/features/ai/types'
import { checkRateLimit } from '@/lib/rateLimit'

const metadata = 'provider, key_preview, is_valid, last_verified_at'
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const failure = (error: string, status: number) => json({ error }, status)

export async function GET() {
  const { profile, response } = await authorizeApi('ai_providers:write')
  if (response) return response
  const client = await createClient()
  const { data, error } = await client.from('llm_provider_keys').select(metadata)
    .eq('user_id', profile.id).order('provider')
  return error ? failure('Provider settings could not be loaded. Retry shortly.', 503) : json({ keys: data ?? [] })
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  // Keys are small; bound streaming input even without Content-Length.
  const reader = request.body?.getReader()
  if (!reader) return null
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16_384) { await reader.cancel(); return null }
      chunks.push(value)
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch { return null }
}
function validProvider(value: unknown): value is LLMProvider {
  return PROVIDERS.some(provider => provider.id === value)
}
function mutationBoundary(request: Request, owner: string) {
  // Next can construct request.url from its internal localhost listener. The
  // browser's Host header identifies the destination; forwarded hosts are not trusted.
  const destination = new URL(request.url)
  const host = request.headers.get('host')
  if (host) destination.host = host
  if (request.headers.get('origin') !== destination.origin) return failure('Manage keys from Settings in this application.', 403)
  if (!checkRateLimit(`ai-providers:${owner}`, 10, 60_000).allowed) return failure('Too many requests. Wait a minute and retry.', 429)
  return null
}

export async function POST(request: Request) {
  const { profile, response } = await authorizeApi('ai_providers:write')
  if (response) return response
  const blocked = mutationBoundary(request, profile.id)
  if (blocked) return blocked
  const body = await readBody(request)
  if (!body || !validProvider(body.provider)) return failure('Choose a supported provider and supply valid JSON.', 400)
  if (body.owner_id !== undefined && body.owner_id !== profile.id) return failure('Your signed-in account changed. Reload Settings and retry.', 409)
  const provider = body.provider
  if (body.action !== undefined && body.action !== 'verify') return failure('Unknown provider action.', 400)
  if (body.action === 'verify') {
    const client = await createClient()
    const { data, error } = await client.from('llm_provider_keys').select('encrypted_key')
      .eq('user_id', profile.id).eq('provider', provider).maybeSingle()
    if (error) return failure('Provider credentials could not be loaded.', 503)
    if (!data) return failure('Save your own provider key before verifying it.', 404)
    let plaintext: string
    try { plaintext = decryptSecret(data.encrypted_key) } catch { return failure('Provider key could not be decrypted. Check server encryption configuration.', 503) }
    const status = await verifyProviderKey(provider, plaintext)
    if (status === 'unavailable') return json({ error: 'Verification is temporarily unavailable. Your saved key and its previous status are unchanged.', verification_status: status }, 503)
    // A slow verification must not overwrite status after another tab replaces/deletes a key.
    const result = await client.from('llm_provider_keys')
      .update({ is_valid: status === 'verified', last_verified_at: new Date().toISOString() })
      .eq('user_id', profile.id).eq('provider', provider).eq('encrypted_key', data.encrypted_key)
      .select(metadata).maybeSingle()
    if (result.error) return failure('Verification status could not be saved. Retry.', 503)
    if (!result.data) return failure('This key changed during verification. Reload settings and retry.', 409)
    return json({ ...result.data, verification_status: status })
  }
  if (typeof body.api_key !== 'string' || body.api_key.trim().length < 8 || body.api_key.trim().length > 4096) return failure('Enter a provider key between 8 and 4096 characters.', 400)
  const key = body.api_key.trim()
  let encrypted: string
  try { encrypted = encryptSecret(key) } catch { return failure('Server encryption is not configured. Check LLM_KEY_ENCRYPTION_SECRET.', 503) }
  const key_preview = `...${key.slice(-4)}`
  const client = await createClient()
  const { error } = await client.from('llm_provider_keys').upsert({
    user_id: profile.id, provider, encrypted_key: encrypted, key_preview, is_valid: null, last_verified_at: null,
  }, { onConflict: 'user_id,provider' })
  if (error) return failure('Provider key could not be saved. Retry shortly.', 503)
  return json({ provider, key_preview, is_valid: null, last_verified_at: null })
}

export async function DELETE(request: Request) {
  const { profile, response } = await authorizeApi('ai_providers:write')
  if (response) return response
  const blocked = mutationBoundary(request, profile.id)
  if (blocked) return blocked
  const body = await readBody(request)
  if (!body || !validProvider(body.provider)) return failure('Choose a supported provider.', 400)
  if (body.owner_id !== undefined && body.owner_id !== profile.id) return failure('Your signed-in account changed. Reload Settings and retry.', 409)
  const client = await createClient()
  const { error } = await client.from('llm_provider_keys').delete().eq('user_id', profile.id).eq('provider', body.provider)
  return error ? failure('Provider key could not be removed. Retry shortly.', 503) : json({ success: true })
}
