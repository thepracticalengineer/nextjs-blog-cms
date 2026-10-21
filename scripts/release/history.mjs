import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { parseConventionalCommits } = require('release-please/build/src/commit.js')

/** Preserve upstream commit/PR parsing, but yield the exact Git ancestry range. */
export async function orderedHistory({ iterate, shas, options }) {
  const wanted = new Set(shas), found = new Map()
  // Stop only once all range commits and the release boundary have been found.
  // The upstream chronological iterator may encounter the boundary first.
  for await (const commit of iterate('main', { ...options, maxResults: 5000 })) {
    if (wanted.has(commit.sha)) found.set(commit.sha, commit)
    if (found.size === wanted.size) break
  }
  const missing = shas.filter(sha => !found.has(sha))
  if (missing.length) throw new Error(`Release history missing ${missing.length} required commits; refusing incomplete release generation.`)
  const history = shas.map(sha => found.get(sha))
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
