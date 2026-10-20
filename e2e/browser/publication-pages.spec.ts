import { loginEditor, publishEditor, unpublishEditor, savePublishedEditor, changePublishedSlug } from '../editor-actions'
import { seedPost } from '../post-fixtures'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'
import { readyArticle } from '../publication-fixture'

test('Editor publication refreshes warmed home, article, taxonomy, author and sitemap surfaces', async ({ page, request }) => {
  test.setTimeout(120_000)
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const key = `publication-pages-${Date.now()}`
  await loginEditor(page)
  let id: string | undefined
  const html = async (path: string) => {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    return response.text()
  }
  try {
    expect((await db.from('categories').insert([{ name: key, slug: key }, { name: `${key}-new`, slug: `${key}-new` }])).error).toBeNull()
    const categories = await db.from('categories').select('id, slug').in('slug', [key, `${key}-new`])
    expect((await db.from('tags').insert([{ name: key, slug: key }, { name: `${key}-new`, slug: `${key}-new` }])).error).toBeNull()
    const post = await seedPost({ ...readyArticle, title: 'Reliable publication across engineering archives', slug: key, category_id: categories.data!.find(row => row.slug === key)!.id })
    id = post.id
    await page.goto(`/dashboard/posts/${id}/edit`)
    await page.getByLabel('Search tags').fill(key)
    await page.getByRole('button', { name: key, exact: true }).click()
    await publishEditor(page)
    const pages = ['/', '/blog', `/blog/${key}`, `/blog/category/${key}`, `/blog/tag/${key}`, `/authors/${post.author_id}`]
    for (const path of pages) expect(await html(path)).toContain(post.title)
    expect(await html('/sitemap.xml')).toContain(`/blog/${key}`)

    const title = 'Updated publication across engineering archives'
    const newSlug = `${key}-new`
    await page.getByLabel('Post title').fill(title)
    await changePublishedSlug(page, newSlug)
    await page.getByLabel('Category', { exact: true }).selectOption(categories.data!.find(row => row.slug === newSlug)!.id)
    await page.getByRole('button', { name: `Remove tag ${key}`, exact: true }).click()
    await page.getByLabel('Search tags').fill(newSlug)
    await page.getByRole('button', { name: newSlug, exact: true }).click()
    await savePublishedEditor(page)
    for (const path of ['/', '/blog', `/blog/${newSlug}`, `/blog/category/${newSlug}`, `/blog/tag/${newSlug}`, `/authors/${post.author_id}`]) expect(await html(path)).toContain(title)
    for (const path of [`/blog/category/${key}`, `/blog/tag/${key}`]) expect(await html(path)).not.toContain(title)
    const old = await request.get(`/blog/${key}`, { maxRedirects: 0 })
    expect(old.status()).toBe(308)
    expect(old.headers().location).toBe(`/blog/${newSlug}`)
    const sitemap = await html('/sitemap.xml')
    expect(sitemap).toContain(`/blog/${newSlug}</loc>`)
    expect(sitemap).not.toContain(`/blog/${key}</loc>`)

    await unpublishEditor(page)
    for (const path of ['/', '/blog', `/blog/category/${newSlug}`, `/blog/tag/${newSlug}`, `/authors/${post.author_id}`]) expect(await html(path)).not.toContain(title)
    expect((await request.get(`/blog/${newSlug}`)).status()).toBe(404)
    expect((await request.get(`/blog/${key}`)).status()).toBe(404)
    expect(await html('/sitemap.xml')).not.toContain(`/blog/${newSlug}</loc>`)
  } finally {
    if (id) await db.from('posts').delete().eq('id', id)
    await db.from('tags').delete().in('slug', [key, `${key}-new`])
    await db.from('categories').delete().in('slug', [key, `${key}-new`])
  }
})
