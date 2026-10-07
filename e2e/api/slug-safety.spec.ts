import { test, expect } from '../fixtures'

test('concurrent automatic slugs are unique and custom conflicts remain actionable', async ({ request, apiKey }) => {
  const headers = { Authorization: `Bearer ${apiKey}` }
  const title = `Concurrent slug verification ${Date.now()}`
  const ids: string[] = []
  try {
    const responses = await Promise.all([
      request.post('/api/posts/create', { headers, data: { title } }),
      request.post('/api/posts/create', { headers, data: { title } }),
    ])
    const posts = []
    for (const response of responses) {
      const body = await response.json()
      if (response.status() === 201) { ids.push(body.data.post.id); posts.push(body.data.post) }
      expect(response.status()).toBe(201)
    }
    expect(new Set(posts.map(post => post.slug)).size).toBe(2)
    const custom = await request.post('/api/posts/create', { headers, data: { title, slug: posts[0].slug } })
    expect(custom.status()).toBe(409)
    expect((await custom.json()).details.field_errors.slug[0]).toContain('Choose another')
    const punctuation = await request.post('/api/posts/create', { headers, data: { title: '!!!' } })
    expect(punctuation.status()).toBe(201)
    const post = (await punctuation.json()).data.post
    ids.push(post.id)
    expect(post.slug).toMatch(/^draft-[0-9a-f-]{36}$/)
  } finally {
    for (const id of ids) await request.delete(`/api/posts/${id}`, { headers })
  }
})
