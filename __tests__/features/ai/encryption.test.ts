import { describe, it, expect, beforeAll } from 'vitest'

// Set the env var before importing the module
beforeAll(() => {
  process.env.LLM_KEY_ENCRYPTION_SECRET = 'a'.repeat(32)
})

// Dynamic import so the env var is set first
async function getEncryption() {
  return await import('@/lib/encryption')
}

describe('encryption', () => {
  it('round-trips a plaintext secret', async () => {
    const { encryptSecret, decryptSecret } = await getEncryption()
    const original = 'sk-ant-api03-test-key-abc123'
    const ciphertext = encryptSecret(original)
    expect(decryptSecret(ciphertext)).toBe(original)
  })

  it('produces different ciphertext each call (random IV)', async () => {
    const { encryptSecret } = await getEncryption()
    const c1 = encryptSecret('same-secret')
    const c2 = encryptSecret('same-secret')
    expect(c1).not.toBe(c2)
  })

  it('ciphertext has three colon-separated parts', async () => {
    const { encryptSecret } = await getEncryption()
    const parts = encryptSecret('hello').split(':')
    expect(parts).toHaveLength(3)
  })

  it('throws when ciphertext is tampered', async () => {
    const { encryptSecret, decryptSecret } = await getEncryption()
    const ciphertext = encryptSecret('real-key')
    const tampered = ciphertext.slice(0, -4) + 'XXXX'
    expect(() => decryptSecret(tampered)).toThrow()
  })
})
