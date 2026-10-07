'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { generalInfoSchema as schema } from '../validation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { updateProfile } from '@/features/profile/actions'
import type { Profile } from '@/lib/supabase/types'

type FormValues = z.infer<typeof schema>

interface GeneralInfoFormProps {
  profile: Profile
}

export function GeneralInfoForm({ profile }: GeneralInfoFormProps) {
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: profile.full_name ?? '',
      pronouns: profile.pronouns ?? '',
      bio: profile.bio ?? '',
      company: profile.company ?? '',
      location: profile.location ?? '',
      website: profile.website ?? '',
    },
  })

  function normalizeOptional(v: string): string | null {
    return v.trim() === '' ? null : v
  }

  async function onSubmit(values: FormValues) {
    setSaving(true)
    try {
      const result = await updateProfile({
        full_name: values.full_name,
        pronouns: normalizeOptional(values.pronouns),
        bio: normalizeOptional(values.bio),
        company: normalizeOptional(values.company),
        location: normalizeOptional(values.location),
        website: normalizeOptional(values.website),
      })
      if (result.error) {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            if (messages?.[0]) setError(field as keyof FormValues, { type: 'server', message: messages[0] })
          }
        }
        toast.error(result.error)
      } else {
        toast.success('Profile updated')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>General Information</CardTitle>
        <CardDescription>Your name and public profile details</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full Name</Label>
              <Input id="full_name" aria-invalid={!!errors.full_name} aria-describedby={errors.full_name ? 'full_name-error' : undefined} {...register('full_name')} />
              {errors.full_name && <p id="full_name-error" role="alert" className="text-xs text-destructive">{errors.full_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pronouns">Pronouns</Label>
              <Input id="pronouns" placeholder="e.g. he/him, she/her, they/them" aria-invalid={!!errors.pronouns} aria-describedby={errors.pronouns ? 'pronouns-error' : undefined} {...register('pronouns')} />
              {errors.pronouns && <p id="pronouns-error" role="alert" className="text-xs text-destructive">{errors.pronouns.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" rows={3} placeholder="Tell us a little about yourself" aria-invalid={!!errors.bio} aria-describedby={errors.bio ? 'bio-error' : undefined} {...register('bio')} />
            {errors.bio && <p id="bio-error" role="alert" className="text-xs text-destructive">{errors.bio.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="company">Company</Label>
              <Input id="company" aria-invalid={!!errors.company} aria-describedby={errors.company ? 'company-error' : undefined} {...register('company')} />
              {errors.company && <p id="company-error" role="alert" className="text-xs text-destructive">{errors.company.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input id="location" placeholder="City, Country" aria-invalid={!!errors.location} aria-describedby={errors.location ? 'location-error' : undefined} {...register('location')} />
              {errors.location && <p id="location-error" role="alert" className="text-xs text-destructive">{errors.location.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="website">Website</Label>
            <Input id="website" type="url" placeholder="https://yoursite.com" aria-invalid={!!errors.website} aria-describedby={errors.website ? 'website-error' : undefined} {...register('website')} />
            {errors.website && <p id="website-error" role="alert" className="text-xs text-destructive">{errors.website.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={profile.email} disabled className="opacity-60 cursor-not-allowed" />
            <p className="text-xs text-muted-foreground">Email cannot be changed</p>
          </div>

          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
