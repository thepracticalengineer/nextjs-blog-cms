

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Repository agent instructions are maintained alongside the source.
  agentRules: false,
  // PDF.js loads its worker relative to the package at runtime.
  serverExternalPackages: ['pdf-parse'],
  // Keep verification output separate from any existing Next 14 dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    // Uploaded images are served by Supabase. External cover URLs can be added
    // explicitly via a comma-separated hostname allowlist in each environment.
    remotePatterns: [
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL
        ? [{ protocol: 'https', hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, pathname: '/storage/v1/object/public/**' }]
        : []),
      ...(process.env.IMAGE_REMOTE_HOSTS || '').split(',').map((host) => host.trim()).filter(Boolean)
        .map((hostname) => ({ protocol: 'https', hostname })),
    ],
  },
}

export default nextConfig
