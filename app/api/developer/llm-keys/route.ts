import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { encryptSecret } from '@/lib/encryption'
import { validateProviderKey } from '@/features/ai-assistant/llmService'
import type { LLMProvider, LLMProviderKeyRecord } from '@/features/ai-assistant/types'
import { authorizeApi } from '@/lib/auth/api'

/**
 * GET /api/developer/llm-keys
 * Returns which providers are configured and their status.
 * Accessible to all authenticated users (authors need this to know which models are available).
 */
export async function GET() {
  const { profile: user, response } = await authorizeApi()
  if (response) return response

  const serviceClient = createServiceClient()

  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)
  const since = startOfMonth.toISOString()

  const providers: LLMProvider[] = ['claude', 'gemini', 'openai']

  // Fetch keys + per-provider chat counts for this month in parallel
  const [
    { data: rows, error: keysError },
    ...countResults
  ] = await Promise.all([
    serviceClient
      .from('llm_provider_keys')
      .select('provider, key_preview, is_valid, last_verified_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    ...providers.map((p) =>
      serviceClient
        .from('ai_chats')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('llm_provider', p)
        .gte('created_at', since)
    ),
  ])

  if (keysError) {
    console.error('[GET /api/developer/llm-keys] keys query error:', keysError.message)
    return NextResponse.json({ error: 'Failed to load provider keys' }, { status: 500 })
  }

  const chatCounts = new Map<LLMProvider, number>(
    providers.map((p, i) => [p, countResults[i].count ?? 0])
  )

  // One record per provider (take most recent if multiple)
  const seen = new Set<string>()
  const records: LLMProviderKeyRecord[] = []
  for (const row of (rows ?? [])) {
    if (!seen.has(row.provider)) {
      seen.add(row.provider)
      records.push({
        provider: row.provider as LLMProvider,
        key_preview: row.key_preview,
        is_valid: row.is_valid,
        last_verified_at: row.last_verified_at,
        chats_this_month: chatCounts.get(row.provider as LLMProvider) ?? 0,
      })
    }
  }

  // Also surface providers configured via environment variables (no DB row required)
  const envProviders: Array<{ provider: LLMProvider; envValue?: string }> = [
    { provider: 'claude', envValue: process.env.ANTHROPIC_API_KEY },
    { provider: 'gemini', envValue: process.env.GOOGLE_GENERATIVE_AI_KEY },
    { provider: 'openai', envValue: process.env.OPENAI_API_KEY },
  ]
  for (const { provider, envValue } of envProviders) {
    if (envValue && !seen.has(provider)) {
      seen.add(provider)
      records.push({ provider, key_preview: null, is_valid: null, last_verified_at: null, chats_this_month: chatCounts.get(provider) ?? 0 })
    }
  }

  return NextResponse.json({ keys: records })
}

/**
 * POST /api/developer/llm-keys
 * Admin only. Saves or updates a provider API key.
 * Body: { provider: 'claude' | 'gemini', api_key: string }
 */
export async function POST(req: NextRequest) {
  const { profile, response } = await authorizeApi('api_keys:write')
  if (response) return response

  const body = await req.json() as { provider?: string; api_key?: string }
  const { provider, api_key } = body

  if (!provider || !['claude', 'gemini', 'openai'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }
  if (!api_key || api_key.trim().length < 8) {
    return NextResponse.json({ error: 'API key too short' }, { status: 400 })
  }

  const llmProvider = provider as LLMProvider
  const trimmedKey = api_key.trim()

  const isValid = await validateProviderKey(llmProvider, trimmedKey)

  let encrypted: string
  try {
    encrypted = encryptSecret(trimmedKey)
  } catch {
    return NextResponse.json(
      { error: 'Server encryption is not configured correctly. Set LLM_KEY_ENCRYPTION_SECRET and try again.' },
      { status: 500 }
    )
  }
  const key_preview = `...${trimmedKey.slice(-4)}`

  const supabase = await createClient()
  const { error } = await supabase
    .from('llm_provider_keys')
    .upsert(
      {
        user_id: profile.id,
        provider: llmProvider,
        encrypted_key: encrypted,
        key_preview,
        is_valid: isValid,
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ provider: llmProvider, key_preview, is_valid: isValid })
}

/**
 * DELETE /api/developer/llm-keys
 * Admin only. Removes a provider key.
 * Body: { provider: 'claude' | 'gemini' }
 */
export async function DELETE(req: NextRequest) {
  const { profile, response } = await authorizeApi('api_keys:write')
  if (response) return response

  const { provider } = await req.json() as { provider?: string }
  if (!provider || !['claude', 'gemini', 'openai'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('llm_provider_keys')
    .delete()
    .eq('user_id', profile.id)
    .eq('provider', provider)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}


