export const PROVIDERS = [
  { id: 'claude', label: 'Anthropic (Claude)' },
  { id: 'gemini', label: 'Google (Gemini)' },
  { id: 'openai', label: 'OpenAI' },
] as const
export type LLMProvider = typeof PROVIDERS[number]['id']
export type ProviderKeyRecord = {
  provider: LLMProvider
  key_preview: string | null
  is_valid: boolean | null
  last_verified_at: string | null
}
export type VerificationStatus = 'verified' | 'invalid' | 'unavailable'
