import { z } from 'zod'

// Match the existing account-settings policy. Supabase may enforce additional rules.
export const MIN_PASSWORD_LENGTH = 8
export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH, 'Password must be at least 8 characters')
export const recoveryEmailSchema = z.string().trim().email('Enter a valid email address')
export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Confirm your new password'),
}).refine(({ password, confirmPassword }) => password === confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})
