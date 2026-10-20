import { test, expect } from '@playwright/test'

// No database or provider credentials are needed: retired routes must terminate
// before authentication, body parsing, storage, model calls or mutations.
const endpoints: [string, string][] = [
  ['GET', '/api/posts'], ['POST', '/api/posts/create'],
  ...['GET', 'PATCH', 'DELETE'].map(method => [method, '/api/posts/not-a-uuid'] as [string, string]),
  ['GET', '/api/ai-assistant/books'], ['POST', '/api/ai-assistant/books'],
  ['DELETE', '/api/ai-assistant/books/not-a-uuid'],
  ['GET', '/api/ai-assistant/chats'], ['POST', '/api/ai-assistant/chats'],
  ['DELETE', '/api/ai-assistant/chats/not-a-uuid'],
  ['GET', '/api/ai-assistant/chats/not-a-uuid/messages'], ['POST', '/api/ai-assistant/chats/not-a-uuid/messages'],
  ['POST', '/api/ai-assistant/chats/not-a-uuid/generate-post'], ['POST', '/api/ai-assistant/generate'],
  ['GET', '/api/developer/keys'], ['POST', '/api/developer/keys'],
  ['PATCH', '/api/developer/keys/not-a-uuid'], ['DELETE', '/api/developer/keys/not-a-uuid'],
  ['GET', '/api/developer/llm-keys'], ['POST', '/api/developer/llm-keys'], ['DELETE', '/api/developer/llm-keys'],
]

for (const [method, path] of endpoints) {
  for (const credential of ['none', 'bearer', 'cookie'] as const) {
    test(`${method} ${path} is retired with ${credential} credentials`, async ({ request }) => {
      const response = await request.fetch(`${path}?provider=invalid&limit=broken`, {
        method,
        headers: {
          ...(credential === 'bearer' ? { Authorization: 'Bearer fmblog_retired-key' } : {}),
          ...(credential === 'cookie' ? { Cookie: 'sb-invalid-auth-token=malformed' } : {}),
          'Content-Type': 'application/json',
        },
        ...(method === 'GET' ? {} : { data: '{malformed-json' }),
      })
      expect(response.status()).toBe(410)
      expect(response.headers()['content-type']).toContain('application/json')
      expect(await response.json()).toMatchObject({ success: false, code: 'API_RETIRED', error: expect.any(String) })
    })
  }
}
