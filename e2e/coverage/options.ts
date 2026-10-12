import { resolve, dirname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import type { CoverageReportOptions } from 'monocart-coverage-reports'

export const projectRoot = resolve(__dirname, '../..')
export type CoverageSuite = 'main' | 'analytics' | 'oauth' | 'publication'
export const coverageDirectory = (suite: CoverageSuite, root = projectRoot) => resolve(root, 'coverage/e2e', suite)

function hasSourceMap(source = '') {
  return source.split('\n').some(line => {
    const comment = line.trimStart()
    return comment.startsWith('//# sourceMappingURL=') || comment.startsWith('//@ sourceMappingURL=')
  })
}

// Normalize Vite and Turbopack source-map paths into stable repository paths.
export function sourcePath(path: string, info?: { url?: string; distFile?: string }) {
  const original = info?.url ?? path
  if (!original.includes('/') && info?.distFile) path = `${dirname(info.distFile)}/${original}`
  const normalized = decodeURIComponent(path).replaceAll('\\', '/')
  if (/(?:node_modules|next\/src|next\/dist)\//.test(normalized)) return normalized
  const match = /(?:^|\/)(app|components|features|lib)\/(.+?\.[cm]?[jt]sx?)(?:\?.*)?$/.exec(normalized)
  return match ? `${match[1]}/${match[2]}` : normalized
}

export function coverageOptions(suite: CoverageSuite, root = projectRoot, signal?: AbortSignal): CoverageReportOptions {
  return {
    name: `E2E client coverage: ${suite}`,
    baseDir: root,
    outputDir: coverageDirectory(suite, root),
    reports: ['html', 'json', 'json-summary'],
    logging: 'error',
    entryFilter: entry => hasSourceMap(entry.source) && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(entry.url),
    // Resolve source maps while the server is running. Never fetch outside loopback.
    sourceMapResolver: async url => {
      if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) throw new Error('Non-local source map')
      const timeout = AbortSignal.timeout(10_000)
      const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: 'error' })
      if (!response.ok) throw new Error(`Source map HTTP ${response.status}`)
      return response.json()
    },
    sourcePath,
    sourceFilter: path => isApplicationSource(path, root),
  }
}

export function isApplicationSource(path: string, root = projectRoot) {
  const file = sourcePath(path)
  const absolute = resolve(root, file)
  return /^(app|components|features|lib)\/.+\.[cm]?[jt]sx?$/.test(file)
    && existsSync(absolute) && !/^['"]use server['"]/.test(readFileSync(absolute, 'utf8').trimStart())
}
