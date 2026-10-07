import { describe, expect, it } from 'vitest'
import { assertDedicatedTestProject } from '@/e2e/environment'

describe('E2E environment isolation', () => {
  it('refuses production even with an explicit matching reference', () => {
    expect(() => assertDedicatedTestProject('https://zkgodtgpwaoifhxkackv.supabase.co', 'zkgodtgpwaoifhxkackv')).toThrow('production')
  })
  it('refuses mismatched or unconfirmed remote projects', () => {
    expect(() => assertDedicatedTestProject('https://dedicated.supabase.co', undefined)).toThrow('dedicated')
    expect(() => assertDedicatedTestProject('https://other.supabase.co', 'dedicated')).toThrow('dedicated')
  })
  it('accepts local or explicitly identified dedicated environments', () => {
    expect(() => assertDedicatedTestProject('http://127.0.0.1:54321', undefined)).not.toThrow()
    expect(() => assertDedicatedTestProject('https://dedicated.supabase.co', 'dedicated')).not.toThrow()
  })
})
