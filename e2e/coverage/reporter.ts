import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter'
import { CoverageReport } from 'monocart-coverage-reports'
import { coverageDirectory, coverageOptions, isApplicationSource, type CoverageSuite } from './options'

function testCounts(suite: Suite | undefined) {
  if (!suite) return null
  const counts = { passed: 0, failed: 0, skipped: 0, flaky: 0 }
  const labels = { expected: 'passed', unexpected: 'failed', skipped: 'skipped', flaky: 'flaky' } as const
  for (const test of suite.allTests()) counts[labels[test.outcome()]]++
  return counts
}

export default class CoverageReporter implements Reporter {
  private suite?: Suite
  private collected = 0
  private errors = 0
  constructor(private readonly options: { suite: CoverageSuite; root?: string }) {}

  onBegin(_config: unknown, suite: Suite) {
    this.suite = suite
    rmSync(coverageDirectory(this.options.suite, this.options.root), { recursive: true, force: true })
  }

  onTestEnd(_test: TestCase, result: TestResult) {
    this.collected += result.annotations.filter(a => a.type === 'coverage-collected').length
    this.errors += result.annotations.filter(a => a.type === 'coverage-error').length
  }

  private async generateCoverage(directory: string) {
    if (process.env.E2E_COVERAGE !== '1') return 'unavailable: E2E_COVERAGE is not enabled'
    if (!this.collected) return 'unavailable: no browser coverage collected (API-only, skipped, or startup failure)'
    try {
      const report = await new CoverageReport(coverageOptions(this.options.suite, this.options.root)).generate()
      if (report?.files.some(file => !file.distFile || !isApplicationSource(file.sourcePath, this.options.root))) throw new Error('Unmapped bundle in coverage; source maps are incomplete')
      return report?.files.length ? 'collected: loaded client source files only' : 'unavailable: no application sources mapped'
    } catch (error) {
      console.warn('E2E coverage report generation failed:', error instanceof Error ? error.message : String(error))
      rmSync(directory, { recursive: true, force: true })
      mkdirSync(directory, { recursive: true })
      this.errors++
      return 'incomplete: coverage report generation failed'
    }
  }

  async onEnd(result: FullResult) {
    const directory = coverageDirectory(this.options.suite, this.options.root)
    mkdirSync(directory, { recursive: true })
    let coverage = await this.generateCoverage(directory)
    if (this.errors) coverage = `incomplete: ${this.errors} collection/report errors; ${coverage}`
    writeFileSync(join(directory, 'status.json'), JSON.stringify({
      suite: this.options.suite, status: result.status, counts: testCounts(this.suite), coverage,
      collected: this.collected, errors: this.errors,
    }, null, 2))
  }
}
