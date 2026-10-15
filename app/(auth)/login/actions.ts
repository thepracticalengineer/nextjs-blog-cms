'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { credentialFields, loginSchema } from '@/lib/auth/credentials'
import { credentialErrorMessage } from '@/lib/auth/credential-errors'

export async function login(formData: FormData) {
  const parsed = loginSchema.safeParse(credentialFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    if (error) return { error: credentialErrorMessage(error, 'login') }
  } catch (error) {
    return { error: credentialErrorMessage(error, 'login', true) }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
