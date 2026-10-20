import { expect, type Page } from '@playwright/test'

export async function loginEditor(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email address', { exact: true }).fill('e2e-test@playwright.local')
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_TEST_PASSWORD ?? 'E2eTestPassword123!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}
export async function publishEditor(page: Page) {
  await page.getByRole('checkbox', { name: /I have reviewed/ }).check()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm publication', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unpublish', exact: true })).toBeVisible()
}
export async function unpublishEditor(page: Page) {
  await page.getByRole('button', { name: 'Unpublish', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible()
}
export async function savePublishedEditor(page: Page) {
  await page.getByRole('checkbox', { name: /I have reviewed/ }).check()
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.getByText('Published changes saved', { exact: true })).toBeVisible()
}
export async function changePublishedSlug(page: Page, slug: string) {
  await page.getByRole('button', { name: 'Change published URL' }).click()
  await page.getByLabel('Slug', { exact: true }).fill(slug)
  await page.getByRole('checkbox', { name: /Confirm this URL change/ }).check()
}
