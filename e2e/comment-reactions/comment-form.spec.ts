import { test, expect } from '@playwright/test'
const path = '/e2e/comment-reactions/fixture.html'
test.beforeEach(async ({ page }) => {
 await page.route('**/__reactions?*', route => route.fulfill({ json: { data: {}, viewerId: 'reader' } }))
})
test('lost responses preserve drafts and IDs; intentional identical submissions use fresh IDs', async ({ page }) => {
 const requests: string[] = []
 let lose = true
 await page.route('**/__comments', async route => {
  requests.push(route.request().postDataJSON().requestId)
  if (lose) { lose = false; await route.fulfill({ status: 503 }); return }
  await route.fulfill({ json: { data: { id: requests.at(-1) } } })
 })
 await page.goto(path)
 const input = page.getByRole('textbox', { name: 'Comment content' })
 const submit = page.getByRole('button', { name: 'Post Comment', exact: true })
 await input.fill(' Same comment 😀 ')
 await submit.click()
 await expect(page.getByRole('alert')).toContainText('Your draft is kept')
 await expect(input).toHaveValue(' Same comment 😀 ')
 await submit.click()
 await expect(input).toHaveValue('')
 expect(requests[1]).toBe(requests[0])
 await input.fill(' Same comment 😀 ')
 await submit.click()
 await expect(input).toHaveValue('')
 expect(requests[2]).not.toBe(requests[0])
})
test('validation, limit guidance and recovery at 320px', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 640 })
 let limited = true, writes = 0
 await page.route('**/__comments', async route => {
  writes++
  await route.fulfill({ json: limited ? { error: 'Too many comments. Try again in 42 seconds. Your draft is kept.' } : { data: { id: 'saved' } } })
 })
 await page.goto(path)
 const input = page.getByRole('textbox', { name: 'Comment content' })
 const submit = page.getByRole('button', { name: 'Post Comment', exact: true })
 await input.fill(' \t\u00a0')
 await submit.click()
 await expect(page.getByRole('alert')).toHaveText('Comment cannot be empty')
 expect(writes).toBe(0)
 await input.fill('😀'.repeat(2001))
 await submit.click()
 await expect(page.getByRole('alert')).toContainText('2,000 characters or less')
 expect(writes).toBe(0)
 await input.fill('😀'.repeat(2000))
 await expect(page.getByText('2000 / 2,000', { exact: true })).toBeVisible()
 await submit.click()
 await expect(page.getByRole('alert')).toContainText('42 seconds')
 await expect(input).toHaveValue('😀'.repeat(2000))
 limited = false
 await submit.focus()
 await page.keyboard.press('Enter')
 await expect(input).toHaveValue('')
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('rapid submission stays single while pending and preserves text', async ({ page }) => {
 let release!: () => void
 const gate = new Promise<void>(resolve => { release = resolve })
 let writes = 0
 await page.route('**/__comments', async route => { writes++; await gate; await route.fulfill({ json: { data: { id: 'saved' } } }) })
 await page.goto(path)
 const input = page.getByRole('textbox', { name: 'Comment content' })
 await input.fill('Draft')
 const button = page.getByRole('button', { name: 'Post Comment', exact: true })
 await button.focus()
 await page.keyboard.press('Enter')
 await page.keyboard.press('Enter')
 await expect(page.getByRole('button', { name: 'Posting...' })).toBeDisabled()
 await expect(input).toHaveAttribute('readonly', '')
 await expect.poll(() => writes).toBe(1)
 release()
 await expect(input).toHaveValue('')
 expect(writes).toBe(1)
})
