export function authorName(name: string | null): string {
  return name?.trim() || 'Author'
}

export function authorInitials(name: string | null): string {
  return authorName(name).split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function publicWebUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}
