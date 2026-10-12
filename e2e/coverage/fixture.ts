import { test as base } from '@playwright/test'
import { CoverageReport } from 'monocart-coverage-reports'
import { coverageOptions, type CoverageSuite } from './options'

export const test = base.extend({
  // A separate fixture budget keeps coverage IO out of the test's timeout.
  page: [async ({ page, browserName }, provideFixture, testInfo) => {
    if (process.env.E2E_COVERAGE !== '1') return provideFixture(page)
    const suite = testInfo.config.metadata.coverageSuite as CoverageSuite
    const root = testInfo.config.metadata.coverageRoot as string | undefined
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
        const signal = AbortSignal.timeout(15_000)
        try {
          const entries = await page.coverage.stopJSCoverage()
          await new CoverageReport(coverageOptions(suite, root, signal)).add(entries)
          signal.throwIfAborted()
          testInfo.annotations.push({ type: 'coverage-collected' })
        } catch (error) {
          // Preserve the original test result; report failed/aborted collection separately.
          testInfo.annotations.push({ type: 'coverage-error', description: String(error) })
        }
      }
    }
  }, { scope: 'test', timeout: 60_000 }],
})
export { expect } from '@playwright/test'
export type { Page } from '@playwright/test'
