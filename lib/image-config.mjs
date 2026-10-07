/** Shared optimizer allowlist for rendering and publication readiness. */
export function getImageRemotePatterns() {
  return [
    ...(process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [{ protocol: 'https', hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, pathname: '/storage/v1/object/public/**' }]
      : []),
    ...(process.env.IMAGE_REMOTE_HOSTS || '').split(',').map((host) => host.trim()).filter(Boolean)
      .map((hostname) => ({ protocol: 'https', hostname })),
  ]
}
