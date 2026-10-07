'use client'

import { useState, useMemo } from 'react'
import { Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { unpublishPost, deletePost } from '@/features/posts/actions'
import type { PostWithRelations } from '@/features/posts/types'
import { filterAndSort, getCategories, type SortField, type SortDir } from './utils'
import { PostEmptyState } from './EmptyState'
import { PostTableToolbar } from './Toolbar'
import { PostRow } from './PostRow'
import { PostTablePagination } from './Pagination'

interface PostTableProps {
  posts: PostWithRelations[]
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ChevronsUpDown className="h-3 w-3 ml-1 text-gray-400" />
  return sortDir === 'asc'
    ? <ChevronUp className="h-3 w-3 ml-1 text-blue-600" />
    : <ChevronDown className="h-3 w-3 ml-1 text-blue-600" />
}

export function PostTable({ posts }: PostTableProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('updated_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const categories = useMemo(() => getCategories(posts), [posts])
  const filtered = useMemo(
    () => filterAndSort(posts, search, categoryFilter, sortField, sortDir),
    [posts, search, categoryFilter, sortField, sortDir]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const hasFilters = search.trim() !== '' || categoryFilter !== null

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
    setPage(1)
  }

  function handleSearch(val: string) { setSearch(val); setPage(1) }
  function handleCategoryFilter(id: string | null) { setCategoryFilter(id); setPage(1) }
  function handleClearFilters() { setSearch(''); setCategoryFilter(null); setPage(1) }
  function handlePageSizeChange(size: number) { setPageSize(size); setPage(1) }

  function handlePublish(id: string) {
    router.push(`/dashboard/posts/${id}/edit`)
  }

  async function handleUnpublish(id: string) {
    const result = await unpublishPost(id)
    result.error ? toast.error(result.error) : toast.success('Post unpublished')
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    try {
      const result = await deletePost(id)
      if (result?.error) {
        toast.error(result.error)
      }
      // On success deletePost redirects, so toast won't be reached; that's expected.
    } catch {
      // Next.js redirect throws internally — not a real error.
    }
  }

  if (posts.length === 0) return <PostEmptyState />

  const thClass = 'inline-flex items-center text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-gray-900 transition-colors'

  return (
    <div className="space-y-3">
      <PostTableToolbar
        search={search}
        onSearch={handleSearch}
        categories={categories}
        categoryFilter={categoryFilter}
        onCategoryFilter={handleCategoryFilter}
        hasFilters={hasFilters}
        onClearFilters={handleClearFilters}
      />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        {paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-8 w-8 text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-900">No posts found</p>
            <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70">
                  <th className="text-left px-5 py-3.5">
                    <button className={thClass} onClick={() => handleSort('title')}>
                      Title <SortIcon field="title" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 hidden md:table-cell">
                    <button className={thClass} onClick={() => handleSort('author')}>
                      Author <SortIcon field="author" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 hidden sm:table-cell">
                    <button className={thClass} onClick={() => handleSort('status')}>
                      Status <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 hidden lg:table-cell">
                    <button className={thClass} onClick={() => handleSort('updated_at')}>
                      Updated <SortIcon field="updated_at" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map(post => (
                  <PostRow
                    key={post.id}
                    post={post}
                    onPublish={handlePublish}
                    onUnpublish={handleUnpublish}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PostTablePagination
        totalFiltered={filtered.length}
        currentPage={safePage}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  )
}
