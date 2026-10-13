import { z } from 'zod'

// New passwords must match the provider minimum; login/current passwords retain legacy support.
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

export const reauthenticationNonceSchema = z.string().regex(/^\d{6}$/, 'Enter the six-digit code from your email.')
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  nonce: reauthenticationNonceSchema.optional(),
})
