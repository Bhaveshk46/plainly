import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const origin = process.env['SITE_URL'];
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/s/'] }, ...(origin ? { sitemap: new URL('/sitemap.xml', origin).href } : {}) };
}
