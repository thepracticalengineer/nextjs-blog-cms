import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'

// Uses the dedicated project enforced by playwright.config.ts; never production.
test('server lists cross the row cap and preserve URL controls, taxonomy pages and lean payloads', async ({ page, seedPostIds, request }) => {
  test.setTimeout(180_000)
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const owner = await db.from('posts').select('author_id').eq('id', seedPostIds[0]).single()
  expect(owner.error).toBeNull()
  const prefix = `list-${Date.now()}`
  const categories = await db.from('categories').insert([
    { name: prefix, slug: prefix }, { name: `${prefix}-last`, slug: `${prefix}-last` },
  ]).select('id')
  expect(categories.error).toBeNull()
  const [category, lastCategory] = categories.data!
  const tag = await db.from('tags').insert({ name: prefix, slug: prefix }).select('id').single()
  expect(tag.error).toBeNull()
  try {
    for (let start = 0; start < 1005; start += 250) {
      const inserted = await db.from('posts').insert(Array.from({ length: Math.min(250, 1005 - start) }, (_, i) => ({
        author_id: owner.data!.author_id, title: `${prefix} ${String(start + i).padStart(4, '0')}`,
        slug: `${prefix}-${start + i}`, status: 'published', published_at: '2026-01-01T00:00:00Z',
        category_id: start + i === 1004 ? lastCategory.id : category.id,
        content: '<p>' + 'private-body-marker77 '.repeat(300) + '</p>', excerpt: 'List summary',
      }))).select('id')
      expect(inserted.error).toBeNull()
      if (start === 0) expect((await db.from('post_tags').insert(inserted.data!.slice(0, 13).map(p => ({ post_id: p.id, tag_id: tag.data!.id })))).error).toBeNull()
    }
    await page.goto('/login')
    await page.getByLabel('Email address').fill('e2e-test@playwright.local')
    await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_TEST_PASSWORD ?? 'E2eTestPassword123!')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    const response = await page.goto(`/dashboard/posts?q=${prefix}&sort=title&direction=asc&page=101`)
    expect(await response!.text()).not.toContain('private-body-marker77')
    await expect(page.getByText('Showing 1001–1005 of 1005 posts')).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount(6)
    await page.reload()
    await expect(page.getByText(`${prefix} 1004`, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Previous page' }).click()
    await expect(page).toHaveURL(/page=100/)
    await expect(page.getByText('Showing 991–1000 of 1005 posts')).toBeVisible()
    await page.goBack()
    await expect(page.getByText('Showing 1001–1005 of 1005 posts')).toBeVisible()
    await page.getByRole('button', { name: 'Title', exact: true }).click()
    await expect(page.getByRole('row').nth(1)).toContainText(`${prefix} 1004`)
    await page.getByRole('button', { name: '10 / page' }).click()
    await page.getByRole('menuitem', { name: '25 per page' }).click()
    await expect(page.getByRole('row')).toHaveCount(26)
    await page.getByRole('button', { name: 'Category', exact: true }).click()
    await page.getByRole('menuitem', { name: `${prefix}-last`, exact: true }).click()
    await expect(page.getByText('Showing 1–1 of 1 post', { exact: true })).toBeVisible()
    await page.getByRole('textbox', { name: 'Search posts' }).fill('no matching article')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByText('No posts found')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Search posts' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(page).not.toHaveURL(/q=/)
    for (const path of [`/blog/category/${prefix}`, `/blog/tag/${prefix}`]) {
      const html = await request.get(path)
      expect(html.status()).toBe(200)
      expect(await html.text()).not.toContain('private-body-marker77')
      await page.goto(path)
      const pagination = page.getByRole('navigation', { name: 'Article pagination' })
      await expect(pagination.getByRole('link', { name: 'Next →' })).toBeVisible()
      await pagination.getByRole('link', { name: 'Next →' }).click()
      await expect(page).toHaveURL(/page=2/)
      await expect(pagination).toContainText('Page 2')
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/dashboard/posts?q=${prefix}&sort=title&direction=asc&page=101`)
    await expect(page.getByText('Showing 1001–1005 of 1005 posts')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/post-lists-mobile.png', fullPage: true })
  } finally {
    await db.from('posts').delete().like('slug', `${prefix}-%`)
    await db.from('tags').delete().eq('id', tag.data!.id)
    await db.from('categories').delete().in('id', [category.id, lastCategory.id])
  }
})
