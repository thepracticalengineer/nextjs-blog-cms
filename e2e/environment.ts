// Public project reference, not a credential. Never seed or tear down production.
const PRODUCTION_PROJECT_REF = 'zkgodtgpwaoifhxkackv'

export function assertDedicatedTestProject(url: string, expectedRef: string | undefined) {
  const host = new URL(url).hostname
  if (host === `${PRODUCTION_PROJECT_REF}.supabase.co`) throw new Error('Refusing to run E2E seeds or teardown against production.')
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) return
  if (!expectedRef || expectedRef === PRODUCTION_PROJECT_REF || host !== `${expectedRef}.supabase.co`) {
    throw new Error('Set E2E_SUPABASE_PROJECT_REF to the dedicated non-production project reference. The Supabase URL must match it.')
  }
}
