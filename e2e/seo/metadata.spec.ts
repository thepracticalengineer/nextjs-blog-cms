import { expect, test } from '@playwright/test'

const paths = ['/', '/blog', '/blog?page=2', '/blog/resilient-job-queue', '/blog/category/engineering?page=2', '/blog/tag/systems?page=2', '/authors/5af2b64d-c7c0-465f-901f-75cf70737172?page=2']
for (const path of paths) {
  test(`public canonical and social preview: ${path}`, async ({ page, request, baseURL }) => {
    await page.goto(`${path}${path.includes('?') ? '&' : '?'}utm_source=audit`)
    const canonical = `${baseURL}${path === '/' ? '' : path}`
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S+/)
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary')
    const image = await page.locator('meta[property="og:image"]').getAttribute('content')
    const response = await request.get(image!)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/png')
  })
}
test('crawler HTML contains one canonical and sitemap URLs agree with it', async ({ request, baseURL }) => {
  const response = await request.get('/blog/resilient-job-queue?utm_source=audit', { headers: { 'User-Agent': 'Googlebot' } })
  const html = await response.text()
  expect(html.match(/rel="canonical"/g)).toHaveLength(1)
  expect(html).toContain(`href="${baseURL}/blog/resilient-job-queue"`)
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.ok()).toBe(true)
  const xml = await sitemap.text()
  for (const path of ['/', '/blog', '/blog/resilient-job-queue', '/blog/category/engineering', '/blog/tag/systems', '/authors/5af2b64d-c7c0-465f-901f-75cf70737172']) {
    expect(xml).toContain(`<loc>${baseURL}${path === '/' ? '' : path}</loc>`)
  }
})
