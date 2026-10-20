// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => { throw new Error('Retired endpoint accessed auth') }) }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => { throw new Error('Retired endpoint accessed data') }) }))
const modules = import.meta.glob('../../app/api/**/route.ts')
const routes = [
  ['posts', ['GET']], ['posts/create', ['POST']], ['posts/[id]', ['GET', 'PATCH', 'DELETE']],
  ['developer/keys', ['GET', 'POST']], ['developer/keys/[id]', ['PATCH', 'DELETE']], ['developer/llm-keys', ['GET', 'POST', 'DELETE']],
  ['ai-assistant/generate', ['POST']], ['ai-assistant/books', ['GET', 'POST']], ['ai-assistant/books/[bookId]', ['DELETE']],
  ['ai-assistant/chats', ['GET', 'POST']], ['ai-assistant/chats/[chatId]', ['DELETE']],
  ['ai-assistant/chats/[chatId]/messages', ['GET', 'POST']], ['ai-assistant/chats/[chatId]/generate-post', ['POST']],
] as const
for (const [path, methods] of routes) describe(path, () => {
  for (const method of methods) it.each([undefined, 'Bearer legacy-key'])(`${method} retires without processing credentials or malformed input: %s`, async authorization => {
    const route = await modules[`../../app/api/${path}/route.ts`]() as Record<string, (...args: unknown[]) => Promise<Response>>
    const response = await route[method](new Request(`http://localhost/api/${path}`, {
      method, headers: authorization ? { authorization } : {}, ...(method !== 'GET' ? { body: '{malformed' } : {}),
    }), { params: Promise.resolve({ id: 'legacy', chatId: 'legacy', bookId: 'legacy' }) })
    expect(response.status).toBe(410)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ success: false, code: 'API_RETIRED' })
  })
})
