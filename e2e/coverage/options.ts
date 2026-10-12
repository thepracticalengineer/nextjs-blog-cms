import { resolve, dirname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import type { CoverageReportOptions } from 'monocart-coverage-reports'

const sourceMapComment = /(?:^|\n)\s*\/\/[#@] sourceMappingURL=(\S+)/g

export type CoverageSuite = 'main' | 'analytics' | 'oauth' | 'publication'
export const coverageDirectory = (suite: CoverageSuite) => resolve('coverage/e2e', suite)

// Normalize Vite and Turbopack source-map paths into stable repository paths.
export function sourcePath(path: string, info?: { distFile?: string }) {
  if (!path.includes('/') && info?.distFile) path = `${dirname(info.distFile)}/${path}`
  const normalized = decodeURIComponent(path).replaceAll('\\', '/')
  if (/(?:node_modules|next\/src|next\/dist)\//.test(normalized)) return normalized
  const match = normalized.match(/(?:^|\/)(app|components|features|lib)\/(.+?\.[cm]?[jt]sx?)(?:\?.*)?$/)
  return match ? `${match[1]}/${match[2]}` : normalized
}

export function coverageOptions(suite: CoverageSuite): CoverageReportOptions {
  return {
    name: `E2E client coverage: ${suite}`,
    outputDir: coverageDirectory(suite),
    reports: ['html', 'json', 'json-summary'],
    logging: 'error',
    // Resolve source maps while the test server is still running (during add).
    entryFilter: entry => Boolean(entry.source?.match(sourceMapComment)) && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(entry.url),
    // Never fetch external maps or follow redirects outside the disposable server.
    sourceMapResolver: async url => {
      if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) throw new Error('Non-local source map')
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' })
      if (!response.ok) throw new Error(`Source map HTTP ${response.status}`)
      return response.json()
    },
    sourcePath,
    sourceFilter: isApplicationSource,
  }
}

export function isApplicationSource(path: string) {
  const file = sourcePath(path)
  return /^(app|components|features|lib)\/.+\.[cm]?[jt]sx?$/.test(file)
    && existsSync(file) && !/^['"]use server['"]/.test(readFileSync(file, 'utf8').trimStart())
}
