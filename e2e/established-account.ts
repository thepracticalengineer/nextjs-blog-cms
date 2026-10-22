import type { SupabaseClient } from '@supabase/supabase-js'
import { assertDedicatedTestProject } from './environment'

/** Model an account predating rollout in tests for unrelated established-user flows. */
export async function markEstablishedAccount(service: SupabaseClient, userId: string) {
  assertDedicatedTestProject(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.E2E_SUPABASE_PROJECT_REF)
  const { error } = await service.from('onboarding_progress').delete().eq('user_id', userId)
  if (error) throw new Error(`Unable to prepare established E2E account: ${error.message}`)
}
