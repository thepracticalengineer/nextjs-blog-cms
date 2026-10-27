import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const groups = {
  harness: ['analytics', 'bulk-posts', 'image-dialog', 'media-library', 'link-dialog', 'video-dialog', 'comment-reactions', 'article-reactions'],
  auth: ['oauth-ui', 'auth-abuse', 'mfa'],
  content: ['ai-settings', 'homepage', 'seo'],
}
// A CLI argument may select a destination, but can never construct one.
export function groupReportPath(group) {
  switch (group) {
    case 'harness': return 'test-results/isolated-harness.json'
    case 'auth': return 'test-results/isolated-auth.json'
    case 'content': return 'test-results/isolated-content.json'
    default: throw new Error('Unknown isolated browser group')
  }
}

// Groups run on separate runners. Within each group preserve every suite's
// result even if an earlier suite fails, and never run competing servers together.
export function runGroup(group, run = spawnSync, record = () => {}) {
  if (!Object.hasOwn(groups, group)) throw new Error('Unknown isolated browser group')
  let failed = false
  const suites = []
  for (const suite of groups[group]) {
    const result = run('pnpm', ['exec', 'playwright', 'test', `--config=e2e/${suite}.config.ts`], { stdio: 'inherit' })
    suites.push({ name: suite, exitCode: result.status, signal: result.signal ?? null, error: result.error?.message ?? null })
    if (result.status !== 0 || result.error) failed = true
  }
  record({ group, suites })
  return failed ? 1 : 0
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = runGroup(process.argv[2], spawnSync, report => {
    mkdirSync('test-results', { recursive: true })
    writeFileSync(groupReportPath(report.group), JSON.stringify(report, null, 2))
  })
}
