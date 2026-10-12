import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn((url: string) => { throw new Error(url) }) }))
vi.mock('@/features/ai-assistant/chatService', () => ({
  getChats: vi.fn(), createChat: vi.fn(), getChat: vi.fn(), deleteChat: vi.fn(),
  getBooks: vi.fn(), createBook: vi.fn(), deleteBook: vi.fn(), getMessages: vi.fn(),
  addMessage: vi.fn(), updateChatLastMessage: vi.fn(), updateChatTitle: vi.fn(), getBookById: vi.fn(),
}))
vi.mock('@/features/ai-assistant/pdfService', () => ({ extractTextFromPdf: vi.fn() }))
vi.mock('@/features/ai-assistant/llmService', () => ({ validateProviderKey: vi.fn(), generateBlogPost: vi.fn() }))
vi.mock('@/features/api-keys/apiKeyService', () => ({ listApiKeys: vi.fn(), createApiKey: vi.fn(), revokeApiKey: vi.fn(), deleteApiKey: vi.fn(), resolveCategoryId: vi.fn() }))
vi.mock('@/features/posts/media/optimize', () => ({ optimizeImage: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authorizeSession, requireAuth } from '@/lib/auth/session'
import { ownsResource } from '@/lib/auth/api'
import { getChats, deleteChat } from '@/features/ai-assistant/chatService'
import * as keys from '@/app/api/developer/keys/route'
import * as key from '@/app/api/developer/keys/[id]/route'
import * as llmKeys from '@/app/api/developer/llm-keys/route'
import * as chats from '@/app/api/ai-assistant/chats/route'
import * as chat from '@/app/api/ai-assistant/chats/[chatId]/route'
import * as books from '@/app/api/ai-assistant/books/route'
import * as book from '@/app/api/ai-assistant/books/[bookId]/route'
import * as messages from '@/app/api/ai-assistant/chats/[chatId]/messages/route'
import * as generatePost from '@/app/api/ai-assistant/chats/[chatId]/generate-post/route'
import * as media from '@/app/api/post-media/route'
import * as subscribers from '@/app/api/newsletter/subscribers/export/route'

function clientFor(currentLevel = 'aal1', enrolled = true) {
  const profile = { id: 'owner', role: 'author' }
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: profile, error: null }) }
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner', factors: enrolled ? [{ status: 'verified' }] : [] } }, error: null }),
      mfa: { getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel, nextLevel: enrolled ? 'aal2' : 'aal1' }, error: null }) },
    },
    from: vi.fn().mockReturnValue(query),
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return client
}
beforeEach(() => vi.clearAllMocks())

const request = () => new Request('http://localhost/api/test', { method: 'POST', body: '{invalid', headers: { 'content-type': 'application/json' } }) as NextRequest
const endpoints: [string, () => Promise<Response>][] = [
  ['keys GET', () => keys.GET()], ['keys POST', () => keys.POST(request())],
  ['key PATCH', () => key.PATCH(request(), { params: Promise.resolve({ id: 'key' }) })],
  ['key DELETE', () => key.DELETE(request(), { params: Promise.resolve({ id: 'key' }) })],
  ['llm GET', () => llmKeys.GET()], ['llm POST', () => llmKeys.POST(request())], ['llm DELETE', () => llmKeys.DELETE(request())],
  ['chats GET', () => chats.GET()], ['chats POST', () => chats.POST(request())],
  ['chat DELETE', () => chat.DELETE(request(), { params: Promise.resolve({ chatId: 'chat' }) })],
  ['books GET', () => books.GET(request())], ['books POST', () => books.POST(request())],
  ['book DELETE', () => book.DELETE(request(), { params: Promise.resolve({ bookId: 'book' }) })],
  ['messages GET', () => messages.GET(request(), { params: Promise.resolve({ chatId: 'chat' }) })],
  ['messages POST', () => messages.POST(request(), { params: Promise.resolve({ chatId: 'chat' }) })],
  ['generate post', () => generatePost.POST(request(), { params: Promise.resolve({ chatId: 'chat' }) })],
  ['post media', () => media.POST(request())], ['subscribers export', () => subscribers.GET(request())],
]

describe.each(endpoints)('%s direct authorization', (_name, call) => {
  it.each(['aal1', 'lookup-error', 'lookup-throws', 'missing-level', 'no-user', 'identity-error', 'identity-throws'])('denies %s before private reads or side effects', async scenario => {
    const client = clientFor()
    let code = 'MFA_REQUIRED'; let status = 403
    if (scenario.startsWith('lookup') || scenario === 'missing-level' || scenario.startsWith('identity')) { code = 'AUTH_UNAVAILABLE'; status = 503 }
    if (scenario === 'lookup-error') client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
    if (scenario === 'lookup-throws') client.auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('unavailable'))
    if (scenario === 'missing-level') client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: null, nextLevel: null }, error: null })
    if (scenario === 'no-user') { client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null }); code = 'UNAUTHENTICATED'; status = 401 }
    if (scenario === 'identity-error') client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'unavailable' } })
    if (scenario === 'identity-throws') client.auth.getUser.mockRejectedValue(new Error('unavailable'))
    const response = await call()
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ code })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(client.from).not.toHaveBeenCalled()
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(getChats).not.toHaveBeenCalled()
    expect(deleteChat).not.toHaveBeenCalled()
  })
})
it.each([['aal2', true], ['aal1', false]] as const)('allows %s enrolled=%s and retains role checks', async (level, enrolled) => {
  clientFor(level, enrolled)
  expect((await authorizeSession()).profile?.id).toBe('owner')
  expect((await authorizeSession('users:read')).failure?.code).toBe('FORBIDDEN')
  vi.mocked(getChats).mockResolvedValue([])
  expect((await chats.GET()).status).toBe(200)
})
it('denies a stale AAL1 session even when cached factors say no enrollment', async () => {
  const client = clientFor()
  client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
  expect((await authorizeSession()).failure?.code).toBe('MFA_REQUIRED')
})
it('fails closed when the profile lookup fails', async () => {
  const client = clientFor('aal2')
  client.from().single.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
  expect((await authorizeSession()).failure?.code).toBe('AUTH_UNAVAILABLE')
})
it('redirects protected pages to MFA with a safe return path', async () => {
  clientFor()
  await expect(requireAuth('/dashboard/ai-assistant')).rejects.toThrow('/mfa?next=%2Fdashboard%2Fai-assistant')
})
it('never treats a different owner or missing owner as authorized', () => {
  expect(ownsResource({ id: 'owner' }, 'owner')).toBe(true)
  expect(ownsResource({ id: 'owner' }, 'other')).toBe(false)
  expect(ownsResource({ id: 'owner' }, undefined)).toBe(false)
})
it('fails page rendering on outages without entering a challenge redirect loop', async () => {
  const client = clientFor('aal2')
  client.from().single.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
  await expect(requireAuth('/dashboard/ai-assistant')).rejects.toThrow('Authentication could not be verified')
})
it.each([{ name: 'AuthSessionMissingError' }, { status: 401 }])('classifies an absent or expired session as unauthenticated', async error => {
  const client = clientFor()
  client.auth.getUser.mockResolvedValue({ data: { user: null }, error })
  expect((await authorizeSession()).failure?.code).toBe('UNAUTHENTICATED')
})
it('preserves Next.js request-context signals during client construction', async () => {
  const signal = new Error('Dynamic server usage: cookies')
  vi.mocked(createClient).mockRejectedValueOnce(signal)
  await expect(authorizeSession()).rejects.toBe(signal)
})
