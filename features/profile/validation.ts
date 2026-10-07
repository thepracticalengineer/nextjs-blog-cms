import { z } from 'zod'

const textInput = (max: number) => z.string().trim().max(max, `Use at most ${max} characters`)
const nameInput = textInput(120).min(1, 'Name is required')
export const publicUrlInput = textInput(2048).refine((value) => {
  if (!value) return true
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}, 'Use a valid HTTP or HTTPS URL without credentials')

const generalFields = {
  full_name: nameInput,
  pronouns: textInput(100), bio: textInput(2000),
  company: textInput(200), location: textInput(200), website: publicUrlInput,
}
const socialFields = {
  twitter_url: publicUrlInput, linkedin_url: publicUrlInput, github_url: publicUrlInput,
  instagram_url: publicUrlInput, facebook_url: publicUrlInput, youtube_url: publicUrlInput, tiktok_url: publicUrlInput,
}

export const generalInfoSchema = z.object(generalFields)
export const socialLinksSchema = z.object(socialFields)

const optional = (schema: z.ZodType<string, string>) => schema.transform((value) => value || null).nullable().optional()
export const profileUpdateSchema = z.object({
  full_name: nameInput.nullable().optional(),
  pronouns: optional(generalFields.pronouns), bio: optional(generalFields.bio),
  company: optional(generalFields.company), location: optional(generalFields.location),
  website: optional(publicUrlInput),
  twitter_url: optional(publicUrlInput), linkedin_url: optional(publicUrlInput), github_url: optional(publicUrlInput),
  instagram_url: optional(publicUrlInput), facebook_url: optional(publicUrlInput),
  youtube_url: optional(publicUrlInput), tiktok_url: optional(publicUrlInput),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one profile field')
