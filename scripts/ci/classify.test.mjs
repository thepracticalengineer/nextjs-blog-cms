import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const { classify, classifyCheckout } = await import('./classify.mjs').catch(() => ({ classify: () => 'unimplemented', classifyCheckout: () => 'unimplemented' }))
const pkg = version => JSON.stringify({ name: 'cms', version, dependencies: { next: '16.4.2' } })
const manifest = version => JSON.stringify({ '.': version })
const release = { 'package.json': [pkg('1.0.0'), pkg('1.1.0')], '.release-please-manifest.json': [manifest('1.0.0'), manifest('1.1.0')], 'CHANGELOG.md': ['old', 'new'] }
function check(files, extra = {}) {
  return classify({ event: 'pull_request', base: 'develop', head: 'feat/work', files: Object.keys(files), read: (path, side) => files[path]?.[side === 'base' ? 0 : 1], ...extra })
}
test('only known documentation text is lightweight, including deletion', () => {
  assert.equal(check({ 'docs/development/testing.md': ['old', 'new'], 'README.md': ['old', null] }), 'docs')
  for (const path of ['docs/config.json', 'docs/example.ts', 'AGENTS.md', '.github/workflows/ci.yml', 'pnpm-lock.yaml', 'package.json', 'next.config.ts', 'supabase/migrations/change.sql', 'unknown.md']) assert.equal(check({ [path]: ['old', 'new'] }), 'full', path)
  assert.equal(check({}), 'full')
})
test('release metadata requires matching version-only package and manifest changes', () => {
  assert.equal(check(release), 'metadata')
  assert.equal(check(release, { head: 'main' }), 'metadata') // content-verified sync
  for (const modified of [
    { 'pnpm-lock.yaml': ['old', 'new'] },
    { 'package.json': [pkg('1.0.0'), JSON.stringify({ version: '1.1.0', scripts: { test: 'malicious' } })] },
    { 'package.json': [pkg('1.0.0'), null] },
    { '.release-please-manifest.json': [manifest('1.0.0'), manifest('9.0.0')] },
    { 'package.json': [pkg('1.0.0'), '{broken'] },
    { '.release-please-manifest.json': [manifest('1.0.0'), JSON.stringify({ '.': '1.1.0', other: '1.0.0' })] },
  ]) assert.equal(check({ ...release, ...modified }), 'full')
  assert.equal(check({ 'CHANGELOG.md': ['old', 'new'] }), 'full')
})
test('pushes, manual checks, application promotions and unknown events always run fully', () => {
  for (const event of ['push', 'workflow_dispatch', 'unknown']) assert.equal(check(release, { event }), 'full')
  assert.equal(check(release, { base: 'main', head: 'develop' }), 'full')
  assert.equal(check({ 'docs/test.md': ['a', 'b'] }, { base: 'main', head: 'fix/repair' }), 'full')
  assert.equal(check(release, { base: 'main', head: 'fix/repair' }), 'full')
})
test('checkout classification uses the tested merge result, catches renames and fails closed on missing ancestry', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ci-classification-'))
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    git('init', '-b', 'develop'); writeFileSync(join(cwd, 'README.md'), 'base'); git('add', '.'); git('commit', '-m', 'base')
    assert.equal(classifyCheckout({ cwd, event: 'pull_request', base: 'develop', head: 'feat/work' }), 'full')
    git('checkout', '-b', 'feat/work'); writeFileSync(join(cwd, 'README.md'), 'updated'); git('commit', '-am', 'docs')
    git('checkout', 'develop'); git('merge', '--no-ff', 'feat/work', '-m', 'merge')
    assert.equal(classifyCheckout({ cwd, event: 'pull_request', base: 'develop', head: 'feat/work' }), 'docs')
    git('checkout', '-b', 'feat/rename'); git('mv', 'README.md', 'config.ts'); git('commit', '-m', 'rename'); git('checkout', 'develop'); git('merge', '--no-ff', 'feat/rename', '-m', 'merge')
    assert.equal(classifyCheckout({ cwd, event: 'pull_request', base: 'develop', head: 'feat/rename' }), 'full')
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
test('a real metadata merge is lightweight but a package script resolution forces full validation', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ci-metadata-'))
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    const write = (packageText, manifestText) => { writeFileSync(join(cwd, 'package.json'), packageText); writeFileSync(join(cwd, '.release-please-manifest.json'), manifestText) }
    git('init', '-b', 'main'); write(pkg('1.0.0'), manifest('1.0.0')); git('add', '.'); git('commit', '-m', 'base')
    git('checkout', '-b', 'release'); write(pkg('1.1.0'), manifest('1.1.0')); git('commit', '-am', 'release'); git('checkout', 'main'); git('merge', '--no-ff', 'release', '-m', 'merge')
    assert.equal(classifyCheckout({ cwd, event: 'pull_request', base: 'main', head: 'release' }), 'metadata')
    const content = JSON.parse(pkg('1.1.0')); content.scripts = { build: 'changed' }
    writeFileSync(join(cwd, 'package.json'), JSON.stringify(content)); git('commit', '-am', 'resolution', '--amend', '--no-edit')
    assert.equal(classifyCheckout({ cwd, event: 'pull_request', base: 'main', head: 'release' }), 'full')
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
test('metadata version values must be canonical stable strings', () => {
  for (const value of ['01.1.0', '1.1.0\n', ['1.1.0'], '1.1.0-beta.1']) {
    const modified = JSON.parse(pkg('1.1.0')); modified.version = value
    assert.equal(check({ ...release, 'package.json': [pkg('1.0.0'), JSON.stringify(modified)], '.release-please-manifest.json': [manifest('1.0.0'), manifest(value)] }), 'full')
  }
})
