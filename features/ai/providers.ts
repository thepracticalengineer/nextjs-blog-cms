import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import type { LLMProvider, VerificationStatus } from './types'

/** Explicit, bounded credential probe. Listing models never generates an article. */
export async function verifyProviderKey(provider: LLMProvider, apiKey: string): Promise<VerificationStatus> {
  try {
    if (provider === 'claude') {
      await new Anthropic({ apiKey, timeout: 10_000, maxRetries: 0 }).models.list({ limit: 1 })
    } else if (provider === 'openai') {
      await new OpenAI({ apiKey, timeout: 10_000, maxRetries: 0 }).models.list()
    } else {
      await new GoogleGenAI({ apiKey, vertexai: false, httpOptions: { timeout: 10_000, retryOptions: { attempts: 1 } } })
        .models.list({ config: { pageSize: 1 } })
    }
    return 'verified'
  } catch (error) {
    // Never return/log SDK errors: provider responses may contain credential details.
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined
    if (provider === 'gemini' && status === 400 && error instanceof Object && 'message' in error && typeof error.message === 'string') {
      try {
        const payload = JSON.parse(error.message) as { error?: { details?: { reason?: string }[] } }
        if (payload.error?.details?.some(detail => detail.reason === 'API_KEY_INVALID')) return 'invalid'
      } catch { /* Non-JSON errors are unavailable, never exposed to the client. */ }
    }
    return status === 401 || status === 403 ? 'invalid' : 'unavailable' 
  }
}
