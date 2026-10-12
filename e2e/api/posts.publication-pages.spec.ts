import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'
import { readyArticle } from '../publication-fixture'

test('REST publication refreshes warmed home, article, taxonomy, author and sitemap surfaces', async ({ request, apiKey }) => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const key = `publication-pages-${Date.now()}`
  const headers = { Authorization: `Bearer ${apiKey}` }
  let id: string | undefined
  const html = async (path: string) => {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    return response.text()
  }
  try {
    expect((await db.from('categories').insert([{ name: key, slug: key }, { name: `${key}-new`, slug: `${key}-new` }])).error).toBeNull()
    const created = await request.post('/api/posts/create', { headers, data: { ...readyArticle, title: 'Reliable publication across engineering archives', slug: key, status: 'published', editorial_reviewed: true, category: key, tags: [key] } })
    expect(created.status()).toBe(201)
    const post = (await created.json()).data.post
    id = post.id
    const pages = ['/', '/blog', `/blog/${key}`, `/blog/category/${key}`, `/blog/tag/${key}`, `/authors/${post.author_id}`]
    for (const path of pages) expect(await html(path)).toContain(post.title)
    expect(await html('/sitemap.xml')).toContain(`/blog/${key}`)

    const title = 'Updated publication across engineering archives'
    const newSlug = `${key}-new`
    const updated = await request.patch(`/api/posts/${id}`, { headers, data: { title, slug: newSlug, confirm_slug_change: true, editorial_reviewed: true, category: newSlug, tags: [newSlug] } })
    expect(updated.status()).toBe(200)
    for (const path of ['/', '/blog', `/blog/${newSlug}`, `/blog/category/${newSlug}`, `/blog/tag/${newSlug}`, `/authors/${post.author_id}`]) expect(await html(path)).toContain(title)
    for (const path of [`/blog/category/${key}`, `/blog/tag/${key}`]) expect(await html(path)).not.toContain(title)
    const old = await request.get(`/blog/${key}`, { maxRedirects: 0 })
    expect(old.status()).toBe(308)
    expect(old.headers().location).toBe(`/blog/${newSlug}`)
    const sitemap = await html('/sitemap.xml')
    expect(sitemap).toContain(`/blog/${newSlug}</loc>`)
    expect(sitemap).not.toContain(`/blog/${key}</loc>`)

    expect((await request.patch(`/api/posts/${id}`, { headers, data: { status: 'draft' } })).status()).toBe(200)
    for (const path of ['/', '/blog', `/blog/category/${newSlug}`, `/blog/tag/${newSlug}`, `/authors/${post.author_id}`]) expect(await html(path)).not.toContain(title)
    expect((await request.get(`/blog/${newSlug}`)).status()).toBe(404)
    expect((await request.get(`/blog/${key}`)).status()).toBe(404)
    expect(await html('/sitemap.xml')).not.toContain(`/blog/${newSlug}</loc>`)
    expect((await request.delete(`/api/posts/${id}`, { headers })).status()).toBe(200)
  } finally {
    if (id) await db.from('posts').delete().eq('id', id)
    await db.from('tags').delete().in('slug', [key, `${key}-new`])
    await db.from('categories').delete().in('slug', [key, `${key}-new`])
  }
})
