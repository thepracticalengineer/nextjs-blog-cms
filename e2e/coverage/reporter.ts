import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter'
import { CoverageReport } from 'monocart-coverage-reports'
import { coverageDirectory, coverageOptions, isApplicationSource, type CoverageSuite } from './options'

export default class CoverageReporter implements Reporter {
  private suite!: Suite
  private collected = 0
  private errors = 0
  constructor(private options: { suite: CoverageSuite }) {}

  onBegin(_config: unknown, suite: Suite) {
    this.suite = suite
    rmSync(coverageDirectory(this.options.suite), { recursive: true, force: true })
  }

  onTestEnd(_test: TestCase, result: TestResult) {
    this.collected += result.annotations.filter(a => a.type === 'coverage-collected').length
    this.errors += result.annotations.filter(a => a.type === 'coverage-error').length
  }

  async onEnd(result: FullResult) {
    const directory = coverageDirectory(this.options.suite)
    mkdirSync(directory, { recursive: true })
    const counts = { passed: 0, failed: 0, skipped: 0, flaky: 0 }
    for (const test of this.suite?.allTests() ?? []) {
      const outcome = test.outcome()
      counts[outcome === 'expected' ? 'passed' : outcome === 'unexpected' ? 'failed' : outcome]++
    }
    let coverage = 'unavailable: no browser coverage collected (API-only, skipped, or startup failure)'
    if (process.env.E2E_COVERAGE !== '1') coverage = 'unavailable: E2E_COVERAGE is not enabled'
    else if (this.collected) {
      try {
        const report = await new CoverageReport(coverageOptions(this.options.suite)).generate()
        if (report?.files.some(file => !file.distFile || !isApplicationSource(file.sourcePath))) throw new Error('Unmapped bundle in coverage; source maps are incomplete')
        coverage = report?.files.length ? 'collected: loaded client source files only' : 'unavailable: no application sources mapped'
      } catch (error) {
        console.warn('E2E coverage report generation failed:', error instanceof Error ? error.message : String(error))
        rmSync(directory, { recursive: true, force: true })
        mkdirSync(directory, { recursive: true })
        this.errors++
        coverage = 'incomplete: coverage report generation failed'
      }
    }
    if (this.errors) coverage = `incomplete: ${this.errors} collection/report errors; ${coverage}`
    writeFileSync(join(directory, 'status.json'), JSON.stringify({
      suite: this.options.suite, status: result.status, counts: this.suite ? counts : null, coverage,
      collected: this.collected, errors: this.errors,
    }, null, 2))
  }
}
