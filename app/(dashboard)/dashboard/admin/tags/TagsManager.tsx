'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { X, Tag, Plus, Loader2, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createTag, deleteTag } from '@/features/users/categoryActions'
import { useTaxonomyStore } from '@/lib/store/taxonomy'
import type { Tag as TagType } from '@/lib/supabase/types'

interface TagsManagerProps {
  tags: TagType[]
}

export function TagsManager({ tags: initial }: TagsManagerProps) {
  const { tags, setTags, addTagOptimistic, commitTag, rollbackTag, removeTagOptimistic } =
    useTaxonomyStore()

  // Seed store once on mount
  const seeded = useRef(false)
  useEffect(() => {
    if (!seeded.current) {
      setTags(initial)
      seeded.current = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const formRef = useRef<HTMLFormElement>(null)

  async function handleCreate(formData: FormData) {
    const name = (formData.get('name') as string).trim()
    if (!name) return

    const tempId = `optimistic-${crypto.randomUUID()}`
    addTagOptimistic(tempId, name)
    formRef.current?.reset()

    const result = await createTag(formData)

    if (result.error) {
      rollbackTag(tempId)
      toast.error(result.error)
    } else {
      commitTag(tempId, result.tag!)
      toast.success('Tag created')
    }
  }

  async function handleDelete(id: string, name: string) {
    const rollback = removeTagOptimistic(id)
    const result = await deleteTag(id)
    if (result.error) {
      rollback()
      toast.error(result.error)
    } else {
      toast.success(`Tag "${name}" deleted`)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr] items-start">
      {/* Create form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 shrink-0">
            <Plus className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">New Tag</h2>
            <p className="text-xs text-muted-foreground">Label posts with topics or keywords</p>
          </div>
        </div>
        <form ref={formRef} action={handleCreate} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name" className="text-xs font-medium">
              Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <Input id="name" name="name" required placeholder="e.g. JavaScript" className="pl-8 h-8 text-sm" />
            </div>
          </div>
          <Button type="submit" size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0">
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Tag
          </Button>
        </form>
      </div>

      {/* Tag cloud */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-50 shrink-0">
            <Tag className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Existing Tags</h2>
            <p className="text-xs text-muted-foreground">{tags.length} tag{tags.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {tags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Tag className="h-10 w-10 text-gray-200 mb-3" />
            <p className="text-sm text-muted-foreground">No tags yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isOptimistic = tag.id.startsWith('optimistic-')
              return (
                <span
                  key={tag.id}
                  className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 ${
                    isOptimistic
                      ? 'bg-blue-50 text-blue-500 opacity-70'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {isOptimistic ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Hash className="h-3 w-3 text-slate-400" />
                  )}
                  {tag.name}
                  {!isOptimistic && (
                    <button
                      onClick={() => handleDelete(tag.id, tag.name)}
                      aria-label={`Delete tag ${tag.name}`}
                      className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-red-100 hover:text-red-600 text-slate-400 transition-colors duration-150 ml-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
