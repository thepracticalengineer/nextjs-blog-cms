import { test, expect } from '../fixtures'

const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000'

test.describe('PATCH /api/posts/[id]', () => {
  test.afterAll(async ({ request, apiKey, seedPostIds }) => {
    // Restore the title so posts.get.spec.ts can assert the original value
    await request.patch(`/api/posts/${seedPostIds[0]}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { title: 'E2E Draft Post One' },
    })
  })

  test('returns 401 with no Authorization header', async ({ request, seedPostIds }) => {
    const res = await request.patch(`/api/posts/${seedPostIds[0]}`, {
      data: { title: 'Should Not Update' },
    })
    expect(res.status()).toBe(401)
  })

  test('returns 404 for a nonexistent post ID', async ({ request, apiKey }) => {
    const res = await request.patch(`/api/posts/${NONEXISTENT_ID}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { title: 'Ghost Post' },
    })
    expect(res.status()).toBe(404)
  })

  test('returns 200 with updated title reflected in response', async ({ request, apiKey, seedPostIds }) => {
    const res = await request.patch(`/api/posts/${seedPostIds[0]}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { title: 'E2E Updated Title' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.title).toBe('E2E Updated Title')
    expect(body.data.id).toBe(seedPostIds[0])
  })
  test('cannot publish an incomplete draft through the API', async ({ request, apiKey, seedPostIds }) => {
    const headers = { Authorization: `Bearer ${apiKey}` }
    const before = await (await request.get(`/api/posts/${seedPostIds[0]}`, { headers })).json()
    const res = await request.patch(`/api/posts/${seedPostIds[0]}`, {
      headers, data: { status: 'published', editorial_reviewed: true },
    })
    expect(res.status()).toBe(422)
    expect((await res.json()).details.field_errors.content).toBeDefined()
    const after = await (await request.get(`/api/posts/${seedPostIds[0]}`, { headers })).json()
    expect(after.data).toEqual(before.data)
  })

})
