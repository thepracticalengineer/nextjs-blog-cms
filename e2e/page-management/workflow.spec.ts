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

test('published URL changes require separate confirmation and keep View Page on the live URL', async ({ page }) => {
  let saved = structuredClone(fixturePage)
  const requests: PageWrite[] = []
  await page.route('**/fixture/write', async route => {
    const request: PageWrite = route.request().postDataJSON(); requests.push(request)
    saved = { ...saved, ...('values' in request ? request.values : {}), revision: randomUUID() }
    if (request.operation === 'publish') saved = { ...saved, status: 'published', published_slug: saved.slug }
    await route.fulfill({ json: { data: { page: saved, replayed: false }, error: null } })
  })
  await page.goto(url)
  await page.getByRole('checkbox', { name: /personally reviewed/ }).check()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByRole('link', { name: 'View Page' })).toHaveAttribute('href', '/about-us')
  await page.getByLabel('URL slug').fill('contact-us')
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /Change the published URL/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View Page' })).toHaveAttribute('href', '/about-us')
  await page.getByRole('checkbox', { name: /personally reviewed/ }).check()
  const update = page.getByRole('button', { name: 'Update published page' })
  await expect(update).toBeDisabled()
  await page.getByRole('checkbox', { name: /Change the published URL/ }).focus()
  await page.keyboard.press('Space')
  await update.click()
  await expect(page.getByRole('link', { name: 'View Page' })).toHaveAttribute('href', '/contact-us')
  expect(requests.at(-1)).toMatchObject({ operation: 'publish', reviewed: true, confirmUrlChange: true })
})
test('revision history compares and restores an older revision without publishing it', async ({ page }) => {
  const older = { ...structuredClone(fixturePage), title: 'Original about', slug: 'original-about', document: { version: 1 as const, blocks: [{ type: 'paragraph' as const, text: 'Our first words.' }] } }
  const olderRevision = randomUUID()
  const summaries = [
    { id: fixturePage.revision, revision: fixturePage.revision, operation: 'save', title: fixturePage.title, slug: fixturePage.slug, status: 'draft', restored_from: null, created_by: fixturePage.id, author_name: 'Page Admin', created_at: '2026-10-29T00:00:00Z' },
    { id: olderRevision, revision: olderRevision, operation: 'create', title: older.title, slug: older.slug, status: 'draft', restored_from: null, created_by: null, author_name: null, created_at: '2026-10-28T00:00:00Z' },
  ]
  let saved = structuredClone(fixturePage)
  const requests: PageWrite[] = []
  await page.route('**/fixture/revisions?*', route => route.fulfill({ json: { data: summaries, error: null } }))
  await page.route('**/fixture/revision?*', route => route.fulfill({ json: { data: { ...older, page_id: fixturePage.id, id: olderRevision, revision: olderRevision, operation: 'create', restored_from: null }, error: null } }))
  await page.route('**/fixture/write', async route => {
    const request: PageWrite = route.request().postDataJSON(); requests.push(request)
    if (request.operation === 'restore') saved = { ...saved, title: older.title, slug: older.slug, document: older.document, revision: randomUUID() }
    await route.fulfill({ json: { data: { page: saved, replayed: false }, error: null } })
  })
  await page.goto(url)
  await page.getByText('Revision history').click()
  await expect(page.getByRole('button', { name: /Draft saved.*Page Admin.*current draft/ })).toBeVisible()
  await page.getByRole('button', { name: /Created.*Deleted account/ }).click()
  const selected = page.getByRole('region', { name: 'Selected revision' })
  await expect(selected).toContainText('Original about')
  await expect(selected.getByRole('list', { name: 'Content changes' })).toContainText('Our first words.')
  await selected.getByRole('button', { name: 'Preview revision' }).click()
  await expect(selected).toContainText('Our first words.')
  page.once('dialog', dialog => dialog.accept())
  await selected.getByRole('button', { name: 'Restore as working draft' }).click()
  await expect(page.getByText(/Revision restored as the working draft/)).toBeVisible()
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ operation: 'restore', pageId: fixturePage.id, expectedRevision: fixturePage.revision, sourceRevision: olderRevision })
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Original about')
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('page attributes move a page under a parent, then trash and restore it', async ({ page }) => {
  const parentId = randomUUID()
  let saved = structuredClone(fixturePage)
  const requests: PageWrite[] = []
  await page.route('**/fixture/tree', route => route.fulfill({ json: { data: [
    { id: fixturePage.id, title: fixturePage.title, slug: fixturePage.slug, parent_id: null, position: 0 },
    { id: parentId, title: 'Company', slug: 'company', parent_id: null, position: 1 },
  ], error: null } }))
  await page.route('**/fixture/write', async route => {
    const request: PageWrite = route.request().postDataJSON(); requests.push(request)
    if (request.operation === 'move') saved = { ...saved, parent_id: request.parentId, position: request.position }
    if (request.operation === 'trash') saved = { ...saved, trashed_at: '2026-11-05T00:00:00Z', status: 'draft' }
    if (request.operation === 'recover') saved = { ...saved, trashed_at: null }
    saved = { ...saved, revision: randomUUID() }
    await route.fulfill({ json: { data: { page: saved, replayed: false }, error: null } })
  })
  await page.goto(url)
  await page.getByText('Page attributes').click()
  await page.getByLabel('Parent page').selectOption(parentId)
  await page.getByRole('button', { name: 'Move page' }).click()
  await expect(page.getByText('Page moved. Its URL is unchanged.')).toBeVisible()
  expect(requests[0]).toMatchObject({ operation: 'move', parentId, position: 0 })
  await expect(page.getByText('Current parent: Company')).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Move to trash' }).click()
  await expect(page.getByRole('alert', { name: 'Page in trash' })).toBeVisible()
  await expect(page.getByLabel('Title', { exact: true })).toBeDisabled()
  expect(requests[1]).toMatchObject({ operation: 'trash' })
  await page.getByRole('button', { name: 'Restore from trash' }).click()
  await expect(page.getByText(/Restored from trash as an unpublished draft/)).toBeVisible()
  await expect(page.getByLabel('Title', { exact: true })).toBeEnabled()
  expect(requests[2]).toMatchObject({ operation: 'recover' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
