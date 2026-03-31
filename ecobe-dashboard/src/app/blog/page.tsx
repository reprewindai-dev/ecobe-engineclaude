import type { Metadata } from 'next'
import Link from 'next/link'

import { blogPosts } from '@/lib/blog/posts'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: 'CO2 Router Blog',
  description:
    'Technical writing on pre-execution environmental governance, deterministic decisioning, proof, replay, provenance, and execution control for compute.',
  path: '/blog',
  keywords: [
    'CO2 Router blog',
    'environmental governance for compute',
    'deterministic control plane',
    'proof replay provenance',
  ],
})

export default function BlogIndexPage() {
  return (
    <div className="space-y-8 pb-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_36%),linear-gradient(180deg,rgba(5,10,20,0.96),rgba(2,8,18,0.98))] p-6 sm:p-8 lg:p-10">
        <div className="max-w-4xl">
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Blog</div>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">
            Writing about pre-execution governance and execution control.
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-8 text-slate-300 sm:text-base">
            CO2 Router publishes category-defining writing about pre-execution environmental
            governance, deterministic decisioning, proof, replay, provenance, and execution
            control for compute systems.
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {blogPosts.map((post) => (
          <article
            key={post.slug}
            className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6"
          >
            <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">
              <span>{post.publishedAt}</span>
              <span>{post.readTime}</span>
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-[-0.03em] text-white">
              <Link href={`/blog/${post.slug}`} className="transition hover:text-cyan-200">
                {post.title}
              </Link>
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">{post.summary}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {post.keywords.slice(0, 3).map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300"
                >
                  {keyword}
                </span>
              ))}
            </div>
            <div className="mt-6">
              <Link
                href={`/blog/${post.slug}`}
                className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200 transition hover:text-white"
              >
                Read article
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
