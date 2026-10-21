import assert from 'node:assert/strict'
import { test } from 'node:test'
const { validateGate } = await import('./gate.mjs').catch(() => ({ validateGate: () => false }))
const full = { classify: { result: 'success', outputs: { mode: 'full' } }, lint: { result: 'success' }, test: { result: 'success' }, build: { result: 'success' }, database: { result: 'success' }, e2e: { result: 'success' }, browsers: { result: 'success' }, coverage: { result: 'success' } }
test('gate accepts full success and intentional lightweight omissions only', () => {
  assert.equal(validateGate(full), true)
  for (const mode of ['docs', 'metadata']) {
    const needs = structuredClone(full); needs.classify.outputs.mode = mode
    for (const key of ['test', 'build', 'database', 'e2e', 'browsers']) needs[key].result = 'skipped'
    assert.equal(validateGate(needs), true)
    needs.lint.result = 'failure'; assert.equal(validateGate(needs), false)
  }
})
test('gate propagates failed, cancelled, unknown and unexpected skipped jobs', () => {
  for (const key of Object.keys(full)) for (const result of ['failure', 'cancelled', 'skipped', 'unknown']) {
    const needs = structuredClone(full); needs[key].result = result
    assert.equal(validateGate(needs), false, `${key}: ${result}`)
  }
  assert.equal(validateGate({}), false)
  const needs = structuredClone(full); needs.classify.outputs.mode = 'unknown'; assert.equal(validateGate(needs), false)
})
