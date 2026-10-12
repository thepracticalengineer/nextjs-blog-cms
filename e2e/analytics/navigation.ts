// Only the isolated component harness uses this navigation adapter.
export const usePathname = () => window.location.pathname
export const useSearchParams = () => new URLSearchParams(window.location.search)
