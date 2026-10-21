import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function validateGate(needs) {
  const mode = needs.classify?.outputs?.mode
  if (!['full', 'docs', 'metadata'].includes(mode)) return false
  const always = ['classify', 'lint', 'coverage']
  const expensive = ['test', 'build', 'database', 'e2e', 'browsers']
  return always.every(key => needs[key]?.result === 'success') && expensive.every(key => needs[key]?.result === (mode === 'full' ? 'success' : 'skipped'))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const needs = JSON.parse(process.env.CI_NEEDS)
  if (!validateGate(needs)) {
    console.error('Required validation failed, was cancelled, or was unexpectedly skipped.', needs)
    process.exitCode = 1
  } else console.log(`All applicable ${needs.classify.outputs.mode} validation passed.`)
}
