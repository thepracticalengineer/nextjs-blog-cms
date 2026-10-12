'use client'

import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuGroup,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { PAGE_SIZE_OPTIONS, buildPageNumbers } from './utils'

interface PaginationProps {
  totalFiltered: number
  currentPage: number
  pageSize: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export function PostTablePagination({
  totalFiltered,
  currentPage,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const pageNumbers = buildPageNumbers(totalPages, currentPage)

  const rangeStart = (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalFiltered)
  const countLabel = totalFiltered === 0
    ? 'No posts'
    : `Showing ${rangeStart}–${rangeEnd} of ${totalFiltered} post${totalFiltered !== 1 ? 's' : ''}`

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <p className="text-xs text-muted-foreground">{countLabel}</p>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageNumbers.map((p, idx) =>
          p === '...' ? (
            <span key={`ellipsis-${idx}`} className="text-xs text-muted-foreground px-1">…</span>
          ) : (
            <button
              key={p}
              aria-current={currentPage === p ? 'page' : undefined}
              onClick={() => onPageChange(p as number)}
              className={cn(
                'inline-flex items-center justify-center h-8 w-8 rounded-lg border text-xs font-medium transition-colors',
                currentPage === p
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
          {pageSize} / page
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {PAGE_SIZE_OPTIONS.map(size => (
              <DropdownMenuItem
                key={size}
                onClick={() => onPageSizeChange(size)}
                className={cn(pageSize === size && 'text-blue-600 font-medium')}
              >
                {size} per page
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
