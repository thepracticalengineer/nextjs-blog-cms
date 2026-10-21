import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const stableVersion = value => typeof value === 'string' && value === value.trim() && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
const releasePaths = new Set(['package.json', '.release-please-manifest.json', 'CHANGELOG.md'])
const documentation = path => path === 'README.md' || /^docs\/.+\.md$/.test(path)

/** Metadata, labels, authors and branch prefixes alone never authorize a skip. */
export function classify({ event, base, head, files, read }) {
  if (event !== 'pull_request' || !['main', 'develop'].includes(base) || !files?.length) return 'full'
  if (base === 'main' && (head === 'develop' || head?.startsWith('fix/'))) return 'full'
  if (files.every(documentation)) return 'docs'
  if (!files.every(path => releasePaths.has(path)) || !files.includes('package.json') || !files.includes('.release-please-manifest.json')) return 'full'
  try {
    const before = JSON.parse(read('package.json', 'base'))
    const after = JSON.parse(read('package.json', 'head'))
    const oldManifest = JSON.parse(read('.release-please-manifest.json', 'base'))
    const newManifest = JSON.parse(read('.release-please-manifest.json', 'head'))
    if (!stableVersion(before.version) || !stableVersion(after.version) || before.version === after.version) return 'full'
    if (!isDeepStrictEqual(oldManifest, { '.': before.version }) || !isDeepStrictEqual(newManifest, { '.': after.version })) return 'full'
    delete before.version
    delete after.version
    return isDeepStrictEqual(before, after) ? 'metadata' : 'full'
  } catch { return 'full' }
}

export function classifyCheckout({ cwd = process.cwd(), event, base, head }) {
  if (event !== 'pull_request') return 'full'
  const git = (...args) => execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    // PR checkout is GitHub's tested merge. Compare against its actual first parent,
    // including merge resolutions; no event base SHA or rename destination shortcut.
    if (git('rev-list', '--parents', '-n', '1', 'HEAD').trim().split(/\s+/).length !== 3) return 'full'
    const files = git('diff', '--no-renames', '--name-only', '-z', 'HEAD^1', 'HEAD').split('\0').filter(Boolean)
    return classify({ event, base, head, files, read: (path, side) => git('show', `${side === 'base' ? 'HEAD^1' : 'HEAD'}:${path}`) })
  } catch { return 'full' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = classifyCheckout({ event: process.env.GITHUB_EVENT_NAME, base: process.env.PR_BASE_REF, head: process.env.PR_HEAD_REF })
  appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Validation mode: **${mode}**. Full validation is mandatory for pushes, manual checks, application promotions, hotfixes and unknown changes.\n`)
}
