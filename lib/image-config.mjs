const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']

function supabaseImagePattern() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.includes(url.hostname))) return []
  return [{ protocol: url.protocol.slice(0, -1), hostname: url.hostname, port: url.port, pathname: '/storage/v1/object/public/**' }]
}

/** Private-IP optimizer access is exclusively for a loopback development stack. */
export function allowLocalImageOptimization() {
  return process.env.NODE_ENV === 'development' && !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    LOOPBACK_HOSTS.includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname)
}

/** Shared optimizer allowlist for rendering and publication readiness. */
export function getImageRemotePatterns() {
  return [
    ...supabaseImagePattern(),
    ...(process.env.IMAGE_REMOTE_HOSTS || '').split(',').map((host) => host.trim()).filter(Boolean)
      .map((hostname) => ({ protocol: 'https', hostname })),
  ]
}
