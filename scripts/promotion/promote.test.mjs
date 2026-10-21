import assert from 'node:assert/strict'
import { test } from 'node:test'

test('promotion workflow scopes credentials and runs immutable develop code', async () => {
  const { readFileSync } = await import('node:fs')
  const workflow = readFileSync(new URL('../../.github/workflows/promote-develop.yml', import.meta.url), 'utf8')
  assert.match(workflow, /branches: \[develop\]/)
  assert.match(workflow, /github.ref == 'refs\/heads\/develop'/)
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/)
  assert.match(workflow, /permission-contents: read/)
  assert.match(workflow, /permission-pull-requests: write/)
  assert.match(workflow, /cancel-in-progress: false/)
  assert.doesNotMatch(workflow, /pnpm install|permission-contents: write/)
  for (const match of workflow.matchAll(/uses: ([^\s]+)/g)) assert.match(match[1], /@[a-f0-9]{40}$/)
})
