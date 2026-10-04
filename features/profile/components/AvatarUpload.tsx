'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { Loader2, Upload, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { updateAvatar, deleteAvatar } from '@/features/profile/actions'
import type { Profile } from '@/lib/supabase/types'

interface AvatarUploadProps {
  profile: Profile
}

export function AvatarUpload({ profile }: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const initials = profile.full_name
    ? profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : profile.email[0].toUpperCase()

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('avatar', file)
      const result = await updateAvatar(fd)
      if (result.error) {
        toast.error(result.error)
      } else {
        setAvatarUrl(result.avatar_url ?? null)
        toast.success('Photo updated')
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      const result = await deleteAvatar()
      if (result.error) {
        toast.error(result.error)
      } else {
        setAvatarUrl(null)
        toast.success('Photo removed')
      }
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Photo</CardTitle>
        <CardDescription>Upload a photo to personalize your profile</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <div className="w-16 h-16 rounded-full overflow-hidden shrink-0">
              <Image
                src={avatarUrl}
                alt="Profile photo"
                width={64}
                height={64}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 text-white font-bold text-xl shrink-0">
              {initials}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload new photo"
            >
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload new photo
            </Button>
            {avatarUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={removing}
                onClick={handleRemove}
                aria-label="Remove photo"
              >
                {removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Remove photo
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">JPG, PNG or GIF · Max 2 MB</p>
      </CardContent>
    </Card>
  )
}
