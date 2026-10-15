import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { configurePorts, reservePorts } from './prepare-e2e-supabase.mjs'

test('rewrites local service ports without changing SMTP credentials, disabled comments or Auth settings', () => {
  const config = '[api]\nport = 54321\n[db]\nport = 54322\nshadow_port = 54320\n[local_smtp]\nport = 54324\n# smtp_port = 54325\n[auth.email.smtp]\nport = 587\n[auth]\nsite_url = "http://localhost:3000"\n'
  const output = configurePorts(config, [55101, 55102, 55103, 55104])
  assert.match(output, /\[db\]\nport = 55102\nshadow_port = 55103/)
  assert.match(output, /\[local_smtp\]\nport = 55104\n# smtp_port = 54325/)
  assert.match(output, /\[auth.email.smtp\]\nport = 587/)
  assert.match(output, /site_url = "http:\/\/localhost:3000"/)
})

test('validates port count and uniqueness before writing configuration', () => {
  const config = '[api]\nport = 54321\n[db]\nport = 54322'
  assert.throws(() => configurePorts(config, [55101]))
  assert.throws(() => configurePorts(config, [55101, 55101]))
  assert.throws(() => configurePorts(config, [0, 55101]))
})

test('reserves distinct available ports while an unrelated service is running', async () => {
  const existing = createServer()
  await new Promise(resolve => existing.listen(0, '0.0.0.0', resolve))
  const reserved = await reservePorts(8)
  try {
    assert.equal(new Set(reserved.ports).size, 8)
    assert.ok(!reserved.ports.includes(existing.address().port))
    const config = readFileSync('supabase/config.toml', 'utf8')
    const output = configurePorts(config, reserved.ports)
    assert.equal((output.match(/^port = /gm) ?? []).length, 6)
    assert.match(output, /project_id = "nextjs-blog-cms"/)
  } finally {
    await reserved.release()
    await new Promise(resolve => existing.close(resolve))
  }
})
