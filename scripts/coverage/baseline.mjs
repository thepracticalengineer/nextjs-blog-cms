import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Ubuntu Actions runner's system installation, never a PATH-resolved PR executable.
const githubCli = '/usr/bin/gh'

// Run only with read-only Actions credentials. Never check out or execute baseline code.
export function downloadBaseline({ sha, repo, directory = 'baseline', run = spawnSync }) {
  rmSync(directory, { recursive: true, force: true })
  mkdirSync(directory, { recursive: true })
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) {
    return 'Baseline unavailable: no exact base commit supplied.'
  }
  const runs = run(githubCli, ['api', `repos/${repo}/actions/workflows/ci.yml/runs?event=push&status=success&head_sha=${sha}&per_page=20`], { encoding: 'utf8' })
  let candidates = []
  try { candidates = JSON.parse(runs.stdout).workflow_runs ?? [] } catch { /* unavailable API/token */ }
  const baseline = candidates.find(candidate => candidate.head_sha === sha && candidate.head_branch === 'main' && candidate.event === 'push' && candidate.conclusion === 'success')
  if (!baseline) return 'Baseline unavailable: no successful main CI run for the exact base commit.'
  const download = run(githubCli, ['run', 'download', String(baseline.id), '--repo', repo, '--name', 'coverage-baseline', '--dir', directory], { encoding: 'utf8' })
  if (download.status !== 0) {
    rmSync(directory, { recursive: true, force: true })
    return 'Baseline unavailable: artifact missing, expired, or inaccessible.'
  }
  return `Downloaded baseline for ${sha}.`
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(downloadBaseline({ sha: process.env.BASELINE_SHA, repo: process.env.GITHUB_REPOSITORY }))
}
