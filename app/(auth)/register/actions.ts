'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { passwordSchema } from '@/lib/auth/password-policy'

export async function register(formData: FormData) {
  const password = passwordSchema.safeParse(formData.get('password'))
  if (!password.success) return { error: password.error.issues[0].message }

  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: password.data,
    options: {
      data: {
        full_name: formData.get('full_name') as string,
      },
    },
  }

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

  const { data: authData, error } = await supabase.auth.signUp({
    ...data,
    options: {
      ...data.options,
      emailRedirectTo: new URL('/auth/callback', baseUrl).toString(),
    },
  })

  if (error) {
    return { error: error.message }
  }

  // If no session, email confirmation is required
  if (!authData.session) {
    return { needsConfirmation: true }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
