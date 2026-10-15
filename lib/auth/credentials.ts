import { z } from 'zod'
import { passwordSchema } from './password-policy'

const emailSchema = z.string().trim().max(254, 'Email must be at most 254 characters').email('Enter a valid email address').toLowerCase()
export const loginSchema = z.object({
  email: emailSchema,
  // Existing accounts may have passwords outside the current signup policy.
  password: z.string().min(1, 'Enter your password'),
})
export const signupSchema = z.object({
  full_name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must be at most 100 characters'),
  email: emailSchema,
  password: passwordSchema.max(1024, 'Password must be at most 1024 characters'),
})
export const registerSchema = signupSchema.extend({ confirmPassword: z.string() }).refine(
  data => data.password === data.confirmPassword,
  { message: 'Passwords do not match', path: ['confirmPassword'] },
)

/** Reject absent, file-valued and ambiguous repeated fields at the server boundary. */
export function credentialFields(formData: FormData) {
  const field = (name: string) => {
    if (!(formData instanceof FormData)) return undefined
    const values = formData.getAll(name)
    return values.length === 1 && typeof values[0] === 'string' ? values[0] : undefined
  }
  return { email: field('email'), password: field('password'), full_name: field('full_name') }
}
