import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'

// Run only with read-only Actions credentials. Never check out or execute baseline code.
const sha = process.env.BASELINE_SHA
const repo = process.env.GITHUB_REPOSITORY
rmSync('baseline', { recursive: true, force: true })
mkdirSync('baseline', { recursive: true })
if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) {
  console.log('Baseline unavailable: no exact base commit supplied.')
} else {
  const runs = spawnSync('gh', ['api', `repos/${repo}/actions/workflows/ci.yml/runs?event=push&status=success&head_sha=${sha}&per_page=20`], { encoding: 'utf8' })
  let candidates = []
  try { candidates = JSON.parse(runs.stdout).workflow_runs ?? [] } catch { /* unavailable API/token */ }
  const run = candidates.find(run => run.head_sha === sha && run.head_branch === 'main' && run.event === 'push' && run.conclusion === 'success')
  if (!run) console.log('Baseline unavailable: no successful main CI run for the exact base commit.')
  else {
    const download = spawnSync('gh', ['run', 'download', String(run.id), '--repo', repo, '--name', 'coverage-baseline', '--dir', 'baseline'], { encoding: 'utf8' })
    console.log(download.status === 0 ? `Downloaded baseline for ${sha}.` : 'Baseline unavailable: artifact missing, expired, or inaccessible.')
  }
}
