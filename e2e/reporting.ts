import { resolve } from 'node:path'
import type { PlaywrightTestConfig } from '@playwright/test'
import { projectRoot, type CoverageSuite } from './coverage/options'

export function reporting(suite: CoverageSuite): Pick<PlaywrightTestConfig, 'outputDir' | 'reporter' | 'metadata'> {
  return {
    outputDir: resolve(projectRoot, 'test-results', suite),
    metadata: { coverageSuite: suite },
    reporter: [
      ['list'],
      ['html', { outputFolder: resolve(projectRoot, 'playwright-report', suite), open: 'never' }],
      ['json', { outputFile: resolve(projectRoot, 'test-results', `${suite}.json`) }],
      [resolve(projectRoot, 'e2e/coverage/reporter.ts'), { suite }],
    ],
  }
}
