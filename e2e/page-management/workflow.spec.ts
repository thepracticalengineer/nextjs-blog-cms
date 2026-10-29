import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { fixturePage } from './data'
import type { PageWrite } from '@/features/pages/schema'
const url = '/e2e/page-management/fixture.html'
test('review, publish, private draft snapshot, preview and unpublish', async ({ page }) => {
  let saved = structuredClone(fixturePage)
  let snapshot: typeof saved | null = null
  const requests: PageWrite[] = []
  await page.route('**/fixture/write', async route => {
    const request: PageWrite = route.request().postDataJSON(); requests.push(request)
    saved = { ...saved, ...('values' in request ? request.values : {}), revision: randomUUID() }
    if (request.operation === 'publish') { saved.status = 'published'; snapshot = structuredClone(saved) }
    if (request.operation === 'unpublish') { saved.status = 'draft'; snapshot = null }
    await route.fulfill({ json: { data: { page: saved, replayed: false }, error: null } })
  })
  await page.goto(url)
  const publish = page.getByRole('button', { name: 'Publish', exact: true })
  await expect(publish).toBeDisabled()
  const review = page.getByRole('checkbox', { name: /personally reviewed/ })
  await review.focus(); await page.keyboard.press('Space')
  await publish.click()
  await expect(page.getByText(/Published snapshot updated/)).toBeVisible()
  expect(requests[0]).toMatchObject({ operation: 'publish', reviewed: true })
  await page.getByLabel('Title', { exact: true }).fill('Private new title')
  await page.getByRole('button', { name: 'Private Preview', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Private page preview' })).toContainText('Private new title')
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
  await expect(page.getByText(/Draft saved/)).toBeVisible()
  expect(snapshot!.title).toBe('About us')
  await expect(review).not.toBeChecked()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Unpublish', exact: true }).click()
  await expect(page.getByText(/Page unpublished/)).toBeVisible()
  expect(snapshot).toBeNull()
  expect(saved.title).toBe('Private new title')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('lost create response survives reload with the identical retry request', async ({ page }) => {
  const requests: PageWrite[] = []
  await page.route('**/fixture/write', async route => {
    const request: PageWrite = route.request().postDataJSON(); requests.push(request)
    if (requests.length === 1) { await route.abort(); return }
    await route.fulfill({ json: { data: { page: { ...fixturePage, ...('values' in request ? request.values : {}) }, replayed: true }, error: null } })
  })
  await page.goto(`${url}?draft=${randomUUID()}`)
  await page.getByLabel('Title', { exact: true }).fill('New page')
  await page.getByLabel('URL slug').fill('new-page')
  await page.getByRole('textbox', { name: 'Page canvas' }).fill('Hello world')
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry previous request' })).toBeEnabled()
  page.once('dialog', dialog => dialog.accept())
  await page.reload()
  await page.getByRole('button', { name: /^Recover New page/ }).click()
  await page.getByRole('button', { name: 'Retry previous request' }).click()
  await expect(page.getByText(/Request confirmed/)).toBeVisible()
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('New page')
})
test('duplicate recovers a distinct unpublished page without claiming source URL', async ({ page }) => {
  let duplicate: PageWrite | null = null
  await page.route('**/fixture/write', async route => {
    duplicate = route.request().postDataJSON() as PageWrite
    await route.fulfill({ json: { data: { page: { ...fixturePage, ...('values' in duplicate ? duplicate.values : {}), id: crypto.randomUUID(), status: 'draft' }, replayed: false }, error: null } })
  })
  await page.goto(url)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await page.getByRole('button', { name: /^Recover About us \(copy\)/ }).click()
  await expect(page.getByLabel('URL slug')).toHaveValue(/^copy-/)
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled()
  await expect(page.getByRole('heading', { name: 'Edit Page', exact: true })).toBeVisible()
  expect(duplicate).toMatchObject({ operation: 'create' })
})
test('stale save preserves input and navigation can be cancelled', async ({ page }) => {
  await page.route('**/fixture/write', route => route.fulfill({ json: { data: null, error: { code: 'PAGE_STALE', message: 'Changed elsewhere. Load latest before retrying.' } } }))
  await page.goto(url)
  await page.getByLabel('Title', { exact: true }).fill('My retained input')
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
  await expect(page.getByText(/Changed elsewhere/)).toBeVisible()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My retained input')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('link', { name: 'All pages' }).click()
  await expect(page).toHaveURL(new RegExp('fixture.html$'))
})

test('a rejected image can be corrected and a rejected duplicate stays in place', async ({ page }) => {
  let fail = true
  await page.route('**/fixture/write', async route => {
    const request: PageWrite = route.request().postDataJSON()
    if (fail) {
      await route.fulfill({ json: { data: null, error: { code: 'PAGE_IMAGE_NOT_ALLOWED', message: 'Replace the rejected image.', writeAttempted: false } } })
      return
    }
    await route.fulfill({ json: { data: { page: { ...fixturePage, ...('values' in request ? request.values : {}) }, replayed: false }, error: null } })
  })
  await page.goto(url)
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
  await expect(page.getByText('Replace the rejected image.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry previous request' })).toHaveCount(0)
  await expect(page.getByLabel('Title', { exact: true })).toBeEditable()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect(page.getByText('Replace the rejected image.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeEnabled()
  await expect(page).toHaveURL(new RegExp('fixture.html$'))
  fail = false
  await page.getByLabel('Title', { exact: true }).fill('Corrected page')
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
  await expect(page.getByText(/Draft saved/)).toBeVisible()
})
