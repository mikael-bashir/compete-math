import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Don't let Google try to crawl your API or private user settings
      disallow: ['/api/', '/account/'],
    },
    sitemap: 'https://competemath.com/sitemap.xml',
  }
}