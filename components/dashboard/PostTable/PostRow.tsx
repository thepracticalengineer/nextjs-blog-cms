'use client'

import { authorName as publicAuthorName } from '@/features/authors/presentation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { MoreHorizontal, Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import type { PostWithRelations } from '@/features/posts/types'

interface PostRowProps {
  post: PostWithRelations
  onPublish: (id: string) => void
  onUnpublish: (id: string) => void
  onDelete: (id: string, title: string) => void
}

export function PostRow({ post, onPublish, onUnpublish, onDelete }: PostRowProps) {
  const router = useRouter()
  const authorName = post.author ? publicAuthorName(post.author.full_name) : '—'
  const authorInitial = authorName[0]?.toUpperCase() ?? '?'

  return (
    <tr className="group hover:bg-blue-50/30 transition-colors duration-150">
      <td className="px-5 py-4">
        <div>
          <div className="flex items-center flex-wrap gap-1.5">
            <Link
              href={`/dashboard/posts/${post.id}/edit`}
              className="font-semibold text-gray-900 hover:text-blue-600 transition-colors"
            >
              {post.title}
            </Link>
            {post.category && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-500">
                {post.category.name}
              </span>
            )}
          </div>
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {post.tags.map(tag => (
                <span key={tag.id} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 text-blue-600">
                  {tag.name}
                </span>
              ))}
            </div>
          )}
          {post.excerpt && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{post.excerpt}</p>
          )}
        </div>
      </td>

      <td className="px-5 py-4 hidden md:table-cell">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-linear-to-br from-blue-400 to-indigo-500 text-white text-[10px] font-bold shrink-0">
            {authorInitial}
          </div>
          <span className="text-sm text-muted-foreground">{authorName}</span>
        </div>
      </td>

      <td className="px-5 py-4 hidden sm:table-cell">
        {post.status === 'published' ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Published
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Draft
          </span>
        )}
      </td>

      <td className="px-5 py-4 hidden lg:table-cell text-sm text-muted-foreground">
        {post.updated_at ? format(new Date(post.updated_at), 'MMM d, yyyy') : '—'}
      </td>

      <td className="px-5 py-4 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Post actions" className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-gray-100 transition-colors opacity-40 group-hover:opacity-100">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => router.push(`/dashboard/posts/${post.id}/edit`)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit post
            </DropdownMenuItem>
            {post.status === 'draft' ? (
              <DropdownMenuItem onClick={() => onPublish(post.id)}>
                <Eye className="h-4 w-4 mr-2" /> Publish
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onUnpublish(post.id)}>
                <EyeOff className="h-4 w-4 mr-2" /> Unpublish
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600 focus:bg-red-50"
              onClick={() => onDelete(post.id, post.title)}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  )
}
