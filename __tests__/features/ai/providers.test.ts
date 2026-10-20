// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const list = vi.fn()
  const generate = vi.fn()
  const client = {
    models: { list, generateContent: generate },
    messages: { create: generate },
    chat: { completions: { create: generate } },
    responses: { create: generate },
  }
  return {
    list,
    generate,
    anthropic: vi.fn(function () { return client }),
    openai: vi.fn(function () { return client }),
    google: vi.fn(function () { return client }),
  }
})
vi.mock('server-only', () => ({}))
vi.mock('@anthropic-ai/sdk', () => ({ default: mocks.anthropic }))
vi.mock('openai', () => ({ default: mocks.openai }))
vi.mock('@google/genai', () => ({ GoogleGenAI: mocks.google }))

import { verifyProviderKey } from '@/features/ai/providers'

const providers = ['claude', 'openai', 'gemini'] as const

beforeEach(() => {
  vi.clearAllMocks()
  mocks.list.mockReset().mockResolvedValue({ data: [] })
})
afterEach(() => vi.restoreAllMocks())

describe('explicit provider credential probes', () => {
  it.each(providers)('verifies %s with one model-list request and never generates content', async (provider) => {
    expect(await verifyProviderKey(provider, 'private-provider-key')).toBe('verified')
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.anthropic).toHaveBeenCalledTimes(provider === 'claude' ? 1 : 0)
    expect(mocks.openai).toHaveBeenCalledTimes(provider === 'openai' ? 1 : 0)
    expect(mocks.google).toHaveBeenCalledTimes(provider === 'gemini' ? 1 : 0)
    if (provider === 'gemini') {
      expect(mocks.google).toHaveBeenCalledWith({
        apiKey: 'private-provider-key', vertexai: false,
        httpOptions: { timeout: 10_000, retryOptions: { attempts: 1 } },
      })
      expect(mocks.list).toHaveBeenCalledWith({ config: { pageSize: 1 } })
    } else {
      const constructor = provider === 'claude' ? mocks.anthropic : mocks.openai
      expect(constructor).toHaveBeenCalledWith({ apiKey: 'private-provider-key', timeout: 10_000, maxRetries: 0 })
      if (provider === 'claude') expect(mocks.list).toHaveBeenCalledWith({ limit: 1 })
      else expect(mocks.list).toHaveBeenCalledWith()
    }
  })

  describe.each(providers)('%s failures', (provider) => {
    it.each([401, 403])('classifies HTTP %s as invalid without returning or logging SDK details', async (status) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mocks.list.mockRejectedValue({ status, message: 'private-provider-key sensitive response' })
      expect(await verifyProviderKey(provider, 'private-provider-key')).toBe('invalid')
      expect(log).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
      expect(mocks.list).toHaveBeenCalledTimes(1)
      expect(mocks.generate).not.toHaveBeenCalled()
    })

    it.each([
      { label: 'rate limit', error: { status: 429, message: 'private-provider-key' } },
      { label: 'server failure', error: { status: 500, message: 'private-provider-key' } },
      { label: 'service unavailable', error: { status: 503, message: 'private-provider-key' } },
      { label: 'network failure', error: new Error('private-provider-key network detail') },
      { label: 'unknown rejection', error: null },
    ])('classifies $label as transient unavailable without error leakage or generation', async ({ error }) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mocks.list.mockRejectedValue(error)
      expect(await verifyProviderKey(provider, 'private-provider-key')).toBe('unavailable')
      expect(log).not.toHaveBeenCalled()
      expect(errorLog).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
      expect(mocks.list).toHaveBeenCalledTimes(1)
      expect(mocks.generate).not.toHaveBeenCalled()
    })
  })
})

it('classifies Gemini API_KEY_INVALID structured 400 as invalid, but leaves other 400 errors unavailable', async () => {
  mocks.list.mockRejectedValueOnce({ status: 400, message: JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID', domain: 'googleapis.com' }] } }) })
  expect(await verifyProviderKey('gemini', 'rejected-key')).toBe('invalid')
  mocks.list.mockRejectedValueOnce({ status: 400, message: 'Some unrelated invalid argument' })
  expect(await verifyProviderKey('gemini', 'key')).toBe('unavailable')
})
