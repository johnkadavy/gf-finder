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
        style={{ borderColor: "var(--border-default)" }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, var(--surface-base))" }}
        />
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6">
            <Link
              href="/blog"
              className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim hover:text-white transition-colors"
            >
              Blog
            </Link>
            <span style={{ color: "var(--border-emphasis)" }}>/</span>
            <span className="font-mono text-ui-sm uppercase tracking-stamp text-text-tertiary line-clamp-1">
              {post.title}
            </span>
          </div>

          <time
            dateTime={post.date}
            className="font-mono text-ui-sm uppercase tracking-editorial text-text-dim block mb-4"
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
        style={{ borderColor: "var(--border-default)" }}
      >
        <Link
          href="/blog"
          className="font-mono text-ui-md uppercase tracking-editorial text-text-label hover:text-white transition-colors"
        >
          ← All Posts
        </Link>
      </div>
    </main>
  );
}
