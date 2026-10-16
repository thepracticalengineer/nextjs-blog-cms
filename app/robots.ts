import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/metadata'

export default function robots(): MetadataRoute.Robots {

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/api/'],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
