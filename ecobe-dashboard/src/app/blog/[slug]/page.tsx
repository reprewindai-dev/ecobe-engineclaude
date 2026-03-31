import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { blogPosts, getBlogPost } from '@/lib/blog/posts'
import { defaultOgImage, siteName, siteUrl } from '@/lib/seo'

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)

  if (!post) {
    return {}
  }

  const path = `/blog/${post.slug}`
  const url = `${siteUrl}${path}`

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical: path,
    },
    keywords: post.keywords,
    openGraph: {
      type: 'article',
      siteName,
      title: post.title,
      description: post.description,
      url,
      publishedTime: post.publishedAt,
      images: [
        {
          url: defaultOgImage,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [defaultOgImage],
    },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getBlogPost(slug)

  if (!post) {
    notFound()
  }

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: {
      '@type': 'Organization',
      name: siteName,
    },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      url: siteUrl,
    },
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
  }

  return (
    <div className="space-y-8 pb-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />

      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_35%),linear-gradient(180deg,rgba(5,10,20,0.96),rgba(2,8,18,0.98))] p-6 sm:p-8 lg:p-10">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-emerald-300">
            <span>Blog</span>
            <span className="text-slate-500">{post.publishedAt}</span>
            <span className="text-slate-500">{post.readTime}</span>
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
            {post.title}
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-8 text-slate-300 sm:text-base">
            {post.summary}
          </p>
        </div>
      </section>

      <article className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="space-y-8">
            {post.sections.map((section) => (
              <section key={section.heading} className="space-y-4">
                <h2 className="text-2xl font-bold tracking-[-0.03em] text-white sm:text-3xl">
                  {section.heading}
                </h2>
                <div className="space-y-4 text-sm leading-8 text-slate-300 sm:text-base">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Related system pages</div>
            <div className="mt-4 space-y-2">
              {post.relatedLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-2xl border border-white/8 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 transition hover:border-cyan-300/30 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Category keywords</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {post.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </article>
    </div>
  )
}
