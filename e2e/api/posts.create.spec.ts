import { test, expect } from '../fixtures'
import { readyArticle } from '../publication-fixture'

test.describe('POST /api/posts/create', () => {
  let createdPostId: string | null = null

  test.afterEach(async ({ request, apiKey }) => {
    if (createdPostId) {
      await request.delete(`/api/posts/${createdPostId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      createdPostId = null
    }
  })

  test('returns 401 with no Authorization header', async ({ request }) => {
    const res = await request.post('/api/posts/create', {
      data: { title: 'Unauthorized Post', content: '<p>Content</p>' },
    })
    expect(res.status()).toBe(401)
  })

  test('returns 422 when publishing without a title', async ({ request, apiKey }) => {
    const res = await request.post('/api/posts/create', {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { content: '<p>No title here</p>', status: 'published' },
    })
    expect(res.status()).toBe(422)
    const body = await res.json()
    expect(body.details.field_errors.title).toBeDefined()
  })

  test('returns 422 when publishing without content', async ({ request, apiKey }) => {
    const res = await request.post('/api/posts/create', {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { title: 'No Content Post', status: 'published' },
    })
    expect(res.status()).toBe(422)
    const body = await res.json()
    expect(body.details.field_errors.content).toBeDefined()
  })

  test('returns 201 with the created post for a valid body', async ({ request, apiKey }) => {
    const res = await request.post('/api/posts/create', {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: {
        title: 'E2E Created Post',
        content: '<p>Created during e2e test run</p>',
        excerpt: 'E2E excerpt',
      },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.post).toMatchObject({
      title: 'E2E Created Post',
      status: 'draft',
    })
    expect(typeof body.data.post.id).toBe('string')
    createdPostId = body.data.post.id
  })
  test('publishes a human-reviewed engineering article through the REST API', async ({ request, apiKey }) => {
    const headers = { Authorization: `Bearer ${apiKey}` }
    const res = await request.post('/api/posts/create', {
      headers, data: { ...readyArticle, slug: `reviewed-article-${Date.now()}`, status: 'published', editorial_reviewed: true },
    })
    expect(res.status()).toBe(201)
    const post = (await res.json()).data.post
    createdPostId = post.id
    expect(post.status).toBe('published')
    expect((await request.get(`/blog/${post.slug}`)).status()).toBe(200)
    const rejected = await request.patch(`/api/posts/${post.id}`, { headers, data: { content: '<p><br></p>', editorial_reviewed: true } })
    expect(rejected.status()).toBe(422)
    const preserved = (await (await request.get(`/api/posts/${post.id}`, { headers })).json()).data
    expect(preserved.content).toBe(readyArticle.content)
    expect(preserved.status).toBe('published')
  })

})
