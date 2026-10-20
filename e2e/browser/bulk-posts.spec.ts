import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'
import { loginEditor } from '../editor-actions'

// The main Playwright config enforces a disposable project and disables mail.
test('bulk actions preserve drafts, retry stale rows and recover emptied pagination', async ({ page, seedPostIds }) => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const owner = await db.from('posts').select('author_id').eq('id', seedPostIds[0]).single()
  expect(owner.error).toBeNull()
  const prefix = `bulk223-${Date.now()}`
  const content = '<p>Preserve this article content and private working copy during unpublish.</p>'
  const inserted = await db.from('posts').insert(Array.from({ length: 6 }, (_, i) => ({
    author_id: owner.data!.author_id, title: `${prefix} ${i + 1}`, slug: `${prefix}-${i + 1}`,
    content, excerpt: 'Bulk action fixture', status: i % 2 === 0 ? 'published' : 'draft',
    published_at: i % 2 === 0 ? new Date().toISOString() : null,
  }))).select('id, title')
  expect(inserted.error).toBeNull()
  const firstId = inserted.data!.find(post => post.title === `${prefix} 1`)!.id
  try {
    expect((await db.from('post_working_copies').insert({
      user_id: owner.data!.author_id, document_id: firstId, post_id: firstId,
      values: { content: 'Private unsaved content' }, revision: crypto.randomUUID(),
    })).error).toBeNull()
    await loginEditor(page)
    await page.goto(`/dashboard/posts?q=${prefix}&size=5&sort=title&direction=asc`)
    const all = page.getByRole('checkbox', { name: 'Select all posts on this page' })
    await all.check()
    await page.getByRole('button', { name: 'Unpublish selected' }).click()
    await expect(page.getByRole('dialog')).toContainText('Unpublish 3 posts')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(all).toBeChecked()
    await page.getByRole('button', { name: 'Unpublish selected' }).click()
    await page.getByRole('button', { name: 'Unpublish 3 posts', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '3 successful, 2 skipped, 0 failed' })).toBeVisible()
    const saved = await db.from('posts').select('content,status').eq('id', firstId).single()
    expect(saved.data).toEqual({ content, status: 'draft' })
    const copy = await db.from('post_working_copies').select('values').eq('post_id', firstId).single()
    expect(copy.data?.values).toEqual({ content: 'Private unsaved content' })

    await page.getByRole('button', { name: 'Next page', exact: true }).click()
    await page.getByRole('checkbox', { name: `Select ${prefix} 6`, exact: true }).check()
    await expect(page.getByRole('button', { name: 'Unpublish selected' })).toBeDisabled()
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await page.getByRole('button', { name: 'Delete 1 post', exact: true }).click()
    await expect(page).not.toHaveURL(/page=2/)
    await expect(page.getByText('Showing 1–5 of 5 posts', { exact: true })).toBeVisible()

    await all.check()
    // Another editor changes the first selected row after it was displayed.
    expect((await db.from('posts').update({ excerpt: 'Changed concurrently' }).eq('id', firstId)).error).toBeNull()
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await page.getByRole('button', { name: 'Delete 5 posts', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '4 successful, 0 skipped, 1 failed' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: `Select ${prefix} 1`, exact: true })).toBeChecked()
    await expect(page.getByText('Showing 1–1 of 1 post', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await page.getByRole('button', { name: 'Delete 1 post', exact: true }).click()
    await expect(page.getByText('No posts found', { exact: true })).toBeVisible()
    expect((await db.from('posts').select('id').in('id', inserted.data!.map(post => post.id)))).toMatchObject({ error: null, data: [] })
  } finally {
    const cleanup = await db.from('posts').delete().in('id', inserted.data!.map(post => post.id))
    expect(cleanup.error).toBeNull()
  }
})
