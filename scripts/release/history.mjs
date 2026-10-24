import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { parseConventionalCommits } = require('release-please/build/src/commit.js')

// Audited recovery for historical retirement metadata already shipped in v2.0.0.
// Exact immutable commits only; see docs/operations/releases.md#historical-retirement-recovery.
export const recoveryBoundary = '25bc3e6ceeb85fca3244964314e48c938bb4e881' // v3.0.1
export const recoveredCommits = new Set([
  '57d97ea68bc4ad947cc59b83ee0a2fd2df7f9769', // sync #234
  '6615f109bf4d7073b7035df4f0ffded4a9110b08', // promotion #233
  '6d47b66f22d22a08cb2631ee4a7acd40ed1ffd81', // sync recovery #236
  'b6ad1bb93e3b4b849ef27712c01cc135ab7b2316', // sync #227
  'bb4c33a559f1592a63c0f6781d08d07ed9c5698a', // sync recovery #226
  '6925b7933f3734b6cf6fff4ce599e76ac75c3266', // sync #221
  'e26478d14c77ecfba5b776c22e238fa5b4de1224', // retirement #219, shipped in v2.0.0
])

/** Preserve upstream commit/PR parsing, but yield the exact Git ancestry range. */
export async function orderedHistory({ iterate, shas, options, recoveryVerified = false }) {
  const wanted = new Set(shas), found = new Map()
  // Stop only once all range commits and the release boundary have been found.
  // The upstream chronological iterator may encounter the boundary first.
  for await (const commit of iterate('main', { ...options, maxResults: 5000 })) {
    if (wanted.has(commit.sha)) found.set(commit.sha, commit)
    if (found.size === wanted.size) break
  }
  const missing = shas.filter(sha => !found.has(sha))
  if (missing.length) throw new Error(`Release history missing ${missing.length} required commits; refusing incomplete release generation.`)
  // Validate API completeness first; never filter the released boundary itself.
  const history = shas.filter((sha, index) => index === shas.length - 1 ||
    !recoveryVerified || !recoveredCommits.has(sha)).map(sha => found.get(sha))
  // The final SHA is the already released boundary, not a new change.
  for (const commit of history.slice(0, -1)) {
    const message = (commit.message ?? '').replace(/^Merge pull request[^\n]*\n\n/, '')
    if (/^chore\((?:promotion|sync)\)!?:/.test(message) &&
        parseConventionalCommits([{ ...commit, message }]).some(parsed => parsed.breaking)) {
      throw new Error(`Breaking release metadata in ${commit.sha}; review promotion/sync history before generating a release. Do not rewrite published tags or force a version.`)
    }
  }
  return history
}
