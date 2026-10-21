import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { orderedHistory } from './history.mjs'

const require = createRequire(import.meta.url)
const { GitHub } = require('release-please/build/src/github.js')
const { Manifest } = require('release-please/build/src/manifest.js')
const { Version } = require('release-please/build/src/version.js')
const git = args => execFileSync('/usr/bin/git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

export async function installAncestryHistory(github, { runGit = git, bootstrapSha } = {}) {
  const iterate = github.mergeCommitIterator.bind(github)
  github.mergeCommitIterator = async function* (branch, options = {}) {
    if (branch !== 'main') throw new Error('Release history supports main only.')
    let latest
    for await (const release of github.releaseIterator()) {
      if (!/^v\d+\.\d+\.\d+$/.test(release.tagName)) continue
      const version = Version.parse(release.tagName.slice(1))
      if (!latest || version.compare(latest.version) > 0) latest = { version, sha: release.sha }
    }
    const boundary = latest?.sha ?? bootstrapSha
    if (!/^[a-f0-9]{40}$/.test(boundary ?? '')) throw new Error('Missing audited release history boundary.')
    // Fails on shallow/missing history, or a newer hosted release than this checkout.
    runGit(['merge-base', '--is-ancestor', boundary, 'HEAD'])
    const range = runGit(['rev-list', '--topo-order', `${boundary}..HEAD`]).split('\n').filter(Boolean)
    const shas = [...range, boundary]
    yield* await orderedHistory({ iterate, shas, options })
  }
}

export async function runRelease({ github, assertCurrent, config, runGit }) {
  await installAncestryHistory(github, { bootstrapSha: config['bootstrap-sha'], runGit })
  await assertCurrent()
  // Validate the unreleased history before publication or PR writes.
  for await (const commit of github.mergeCommitIterator('main')) void commit
  await assertCurrent()
  const manifest = await Manifest.fromManifest(github, 'main')
  await manifest.createReleases()
  // Publication can create a new boundary. The iterator re-reads releases each call.
  await assertCurrent()
  await (await Manifest.fromManifest(github, 'main')).createPullRequests()
}

async function main() {
  if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Release execution requires main.')
  const repository = process.env.GITHUB_REPOSITORY
  const token = process.env.RELEASE_TOKEN
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !token) throw new Error('Missing release repository or App token.')
  const [owner, repo] = repository.split('/')
  const head = git(['rev-parse', 'HEAD'])
  const assertCurrent = async () => {
    const response = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/main`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    })
    if (!response.ok || (await response.json()).object?.sha !== head) {
      throw new Error('main advanced or cannot be verified; rerun on its current head before writing release metadata.')
    }
  }
  const github = await GitHub.create({ owner, repo, defaultBranch: 'main', token })
  const config = JSON.parse(readFileSync('release-please-config.json', 'utf8'))
  await runRelease({ github, assertCurrent, config })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
