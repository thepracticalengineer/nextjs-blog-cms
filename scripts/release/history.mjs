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
  return shas.map(sha => found.get(sha))
}
