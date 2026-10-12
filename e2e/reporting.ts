import { resolve } from 'node:path'
import type { PlaywrightTestConfig } from '@playwright/test'
import type { CoverageSuite } from './coverage/options'

export function reporting(suite: CoverageSuite): Pick<PlaywrightTestConfig, 'outputDir' | 'reporter' | 'metadata'> {
  return {
    outputDir: resolve('test-results', suite),
    metadata: { coverageSuite: suite },
    reporter: [
      ['list'],
      ['html', { outputFolder: resolve('playwright-report', suite), open: 'never' }],
      ['json', { outputFile: resolve('test-results', `${suite}.json`) }],
      [resolve('e2e/coverage/reporter.ts'), { suite }],
    ],
  }
}
