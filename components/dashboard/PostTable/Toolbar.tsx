'use client'

import { Search, X, ChevronDown, FolderOpen } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface ToolbarProps {
  search: string
  onSearch: (val: string) => void
  categories: { id: string; name: string }[]
  categoryFilter: string | null
  onCategoryFilter: (id: string | null) => void
  hasFilters: boolean
  onClearFilters: () => void
}

export function PostTableToolbar({
  search,
  onSearch,
  categories,
  categoryFilter,
  onCategoryFilter,
  hasFilters,
  onClearFilters,
}: ToolbarProps) {
  const selectedCategoryName = categories.find(c => c.id === categoryFilter)?.name

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search posts..."
          className="pl-9 h-9 text-sm"
        />
        {search && (
          <button
            onClick={() => onSearch('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-sm hover:bg-gray-100 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(
            'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm transition-colors cursor-pointer',
            categoryFilter
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          )}>
            <FolderOpen className="h-3.5 w-3.5" />
            {selectedCategoryName ?? 'Category'}
            <ChevronDown className="h-3.5 w-3.5 ml-0.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => onCategoryFilter(null)}>
              All categories
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {categories.map(cat => (
              <DropdownMenuItem
                key={cat.id}
                onClick={() => onCategoryFilter(cat.id)}
                className={cn(categoryFilter === cat.id && 'text-blue-600 font-medium')}
              >
                {cat.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {hasFilters && (
        <button
          onClick={onClearFilters}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-muted-foreground hover:bg-gray-50 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  )
}
