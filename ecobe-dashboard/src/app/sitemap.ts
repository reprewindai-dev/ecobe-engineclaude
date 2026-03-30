import type { MetadataRoute } from 'next'

import { blogPosts } from '@/lib/blog/posts'
import { coreSitePaths, siteUrl } from '@/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticRoutes = coreSitePaths.map((path) => ({
    url: path === '/' ? siteUrl : `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: path === '/' || path === '/blog' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path === '/console' || path === '/methodology' ? 0.9 : 0.7,
  })) satisfies MetadataRoute.Sitemap

  const postRoutes = blogPosts.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: 'monthly',
    priority: 0.8,
  })) satisfies MetadataRoute.Sitemap

  return [...staticRoutes, ...postRoutes]
}
