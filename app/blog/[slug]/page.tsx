import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { marked } from "marked";
import { getPost, getAllPosts, formatDate } from "@/lib/blog";

export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} | CleanPlate`,
    description: post.description || undefined,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: `${post.title} | CleanPlate`,
      description: post.description || undefined,
      type: "article",
      url: `/blog/${slug}`,
      publishedTime: post.date,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const html = await marked(post.content);

  return (
    <main className="pt-16">
      {/* Hero */}
      <section
        className="grid-bg border-b px-4 md:px-8 py-14 md:py-20 relative"
        style={{ borderColor: "oklch(0.22 0 0)" }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, oklch(0.08 0 0))" }}
        />
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6">
            <Link
              href="/blog"
              className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.58_0_0)] hover:text-white transition-colors"
            >
              Blog
            </Link>
            <span className="text-[oklch(0.3_0_0)]">/</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.75_0_0)] line-clamp-1">
              {post.title}
            </span>
          </div>

          <time
            dateTime={post.date}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-[oklch(0.58_0_0)] block mb-4"
          >
            {formatDate(post.date)}
          </time>

          <h1
            className="font-[family-name:var(--font-display)] leading-tight"
            style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)", letterSpacing: "0.02em" }}
          >
            {post.title}
          </h1>
        </div>
      </section>

      {/* Body */}
      <article className="max-w-3xl mx-auto px-4 md:px-8 py-12 md:py-16">
        <div
          className="blog-prose"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>

      {/* Footer nav */}
      <div
        className="max-w-3xl mx-auto px-4 md:px-8 pb-16 border-t pt-8"
        style={{ borderColor: "oklch(0.22 0 0)" }}
      >
        <Link
          href="/blog"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.65_0_0)] hover:text-white transition-colors"
        >
          ← All Posts
        </Link>
      </div>
    </main>
  );
}
