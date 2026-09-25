import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env['SITE_URL'];
  return origin ? [{ url: new URL('/', origin).href, changeFrequency: 'monthly', priority: 1 }] : [];
}
