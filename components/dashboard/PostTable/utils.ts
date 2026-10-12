export { PAGE_SIZE_OPTIONS } from '@/features/posts/list-state'

export function buildPageNumbers(totalPages: number, currentPage: number): (number | '...')[] {
  return [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b)
    .reduce<(number | '...')[]>((acc, p, idx, arr) => {
      if (idx > 0 && typeof arr[idx - 1] === 'number' && p - (arr[idx - 1] as number) > 1) {
        acc.push('...')
      }
      acc.push(p)
      return acc
    }, [])
}
