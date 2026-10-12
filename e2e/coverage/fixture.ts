import { test as base, expect } from '@playwright/test'
import { CoverageReport } from 'monocart-coverage-reports'
import { coverageOptions, type CoverageSuite } from './options'

export const test = base.extend({
  page: async ({ page, browserName }, provideFixture, testInfo) => {
    if (process.env.E2E_COVERAGE !== '1') return provideFixture(page)
    const suite = testInfo.config.metadata.coverageSuite as CoverageSuite
    let started = false
    try {
      if (browserName !== 'chromium') throw new Error('Client coverage requires Chromium')
      await page.coverage.startJSCoverage({ resetOnNavigation: false })
      started = true
    } catch (error) {
      testInfo.annotations.push({ type: 'coverage-error', description: String(error) })
    }
    try {
      await provideFixture(page)
    } finally {
      if (started) {
        try {
          const entries = await page.coverage.stopJSCoverage()
          await new CoverageReport(coverageOptions(suite)).add(entries)
          testInfo.annotations.push({ type: 'coverage-collected' })
        } catch (error) {
          // Preserve the original test result; the report separately flags incomplete collection.
          testInfo.annotations.push({ type: 'coverage-error', description: String(error) })
        }
      }
    }
  },
})
export { expect }
export type { Page } from '@playwright/test'
