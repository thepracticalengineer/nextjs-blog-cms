import { test, expect } from '../fixtures'
import { loginEditor } from '../editor-actions'
import { readPost, removePost } from '../post-fixtures'

test('concurrent editor saves allocate unique automatic slugs', async ({ page }) => {
  await loginEditor(page)
  const second = await page.context().newPage()
  const pages = [page, second]
  const ids: string[] = []
  try {
    await Promise.all(pages.map(async editor => {
      await editor.goto('/dashboard/posts/new')
      await expect(editor.locator('.ProseMirror')).toBeVisible()
      ids.push(new URL(editor.url()).searchParams.get('draft')!)
      await editor.getByLabel('Post title').fill('Concurrent editor slug verification')
      await editor.getByLabel('Post title').blur()
      await editor.getByLabel('Slug', { exact: true }).fill('')
    }))
    await Promise.all(pages.map(async editor => {
      await editor.getByRole('button', { name: 'Save Draft', exact: true }).click()
      await expect(editor.getByText('Post saved as draft', { exact: true })).toBeVisible()
    }))
    const posts = await Promise.all(ids.map(readPost))
    expect(new Set(posts.map(post => post.slug)).size).toBe(2)
    for (const post of posts) expect(post.slug).toMatch(/^concurrent-editor-slug-verification(?:-\d+)?$/)
  } finally {
    await second.close()
    for (const id of ids) await removePost(id)
  }
})
