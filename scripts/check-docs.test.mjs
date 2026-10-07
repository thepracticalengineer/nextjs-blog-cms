import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const checker = path.resolve('scripts/check-docs.mjs')
const skills = ['vercel-react-best-practices', 'vercel-composition-patterns', 'shadcn', 'playwright-cli']
function fixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'cms-docs-check-'))
  try {
    mkdirSync(path.join(root, 'docs'))
    mkdirSync(path.join(root, '.claude/skills'), { recursive: true })
    for (const name of ['README.md', 'AGENTS.md', 'CLAUDE.md', 'docs/README.md']) writeFileSync(path.join(root, name), '# Overview\n')
    writeFileSync(path.join(root, 'skills-lock.json'), JSON.stringify({ skills: Object.fromEntries(skills.map(name => [name, {}])) }))
    for (const name of skills) {
      mkdirSync(path.join(root, '.agents/skills', name), { recursive: true })
      writeFileSync(path.join(root, '.agents/skills', name, 'SKILL.md'), '# Skill\n')
      symlinkSync(`../../.agents/skills/${name}`, path.join(root, '.claude/skills', name))
    }
    run(root, () => spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' }))
  } finally { rmSync(root, { recursive: true, force: true }) }
}

test('valid same-file and cross-file anchors resolve, including duplicate and HTML headings', () => fixture((root, check) => {
  writeFileSync(path.join(root, 'docs/README.md'), '# Overview\n## <b>Details</b> ##\n## Details\n[x](#overview)\n[x](#details)\n[x](#details-1)\n[x](../README.md#overview)\n')
  assert.equal(check().status, 0)
}))

test('missing same-file anchors, cross-file anchors and files fail validation', () => fixture((root, check) => {
  writeFileSync(path.join(root, 'docs/README.md'), '# Overview\n[x](#missing)\n[x](../README.md#missing)\n[x](absent.md)\n')
  const result = check()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /missing anchor: #missing/)
  assert.match(result.stderr, /missing anchor: ..\/README.md#missing/)
  assert.match(result.stderr, /missing target: absent.md/)
}))

test('backtick and tilde fenced examples do not create links or anchors', () => fixture((root, check) => {
  writeFileSync(path.join(root, 'README.md'), '# Overview\n```md\n[x](missing.md)\n## Hidden\n```\n~~~md\n[x](missing.md)\n~~~\n[x](#overview)\n')
  assert.equal(check().status, 0)
  writeFileSync(path.join(root, 'docs/README.md'), '[x](../README.md#hidden)\n')
  assert.equal(check().status, 1)
}))

for (const kind of ['missing', 'copied', 'broken', 'wrong']) {
  test(`Claude discovery rejects ${kind} skill aliases`, () => fixture((root, check) => {
    const alias = path.join(root, '.claude/skills', skills[0])
    rmSync(alias)
    if (kind === 'copied') mkdirSync(alias)
    if (kind === 'broken') symlinkSync('../../.agents/skills/missing', alias)
    if (kind === 'wrong') symlinkSync(`../../.agents/skills/${skills[1]}`, alias)
    const result = check()
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Claude skill/)
  }))
}

test('nested label delimiters do not hide a broken inner link', () => fixture((root, check) => {
  writeFileSync(path.join(root, 'README.md'), '# Overview\n[outer [inner](absent.md)]\n')
  const result = check()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /missing target: absent.md/)
}))
