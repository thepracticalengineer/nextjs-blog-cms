import 'server-only'
import { authorizeSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { decryptSecret } from '@/lib/encryption'
import type { LLMProvider } from './types'

/** Resolve the authenticated owner's credential; never select a shared billing account. */
export async function getProviderKey(provider: LLMProvider): Promise<string> {
  const { profile, failure } = await authorizeSession('ai_providers:write')
  if (failure) throw new Error(failure.error)
  const client = await createClient()
  const { data, error } = await client.from('llm_provider_keys')
    .select('encrypted_key').eq('user_id', profile.id).eq('provider', provider).maybeSingle()
  if (error) throw new Error('Provider credentials could not be loaded. Try again.')
  if (!data) throw new Error('Configure your own key in Settings → AI Providers.')
  try { return decryptSecret(data.encrypted_key) } catch {
    throw new Error('Provider credentials could not be decrypted. Check server encryption configuration.')
  }
}
