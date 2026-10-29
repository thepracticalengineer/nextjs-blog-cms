// Vite fixture navigation substitutes for Next's router.
/* eslint-disable @next/next/no-location-assign-relative-destination */
export function useRouter() { return { push: (url: string) => { const target = new URL(url, location.origin); location.assign(`/e2e/page-management/fixture.html${target.search}`) } } }
