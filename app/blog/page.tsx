import Link from "next/link";
import type { Metadata } from "next";
import { getAllPosts, formatDate } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — Gluten-Free Dining Guides & Tips | CleanPlate",
  description: "Guides, neighborhood roundups, and tips for celiac-safe dining in NYC. Written by the CleanPlate team.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog — Gluten-Free Dining Guides & Tips | CleanPlate",
    description: "Guides, neighborhood roundups, and tips for celiac-safe dining in NYC.",
    type: "website",
    url: "/blog",
  },
};

export default function BlogIndexPage() {
  const posts = getAllPosts();

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
        <div className="max-w-4xl mx-auto">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.58_0_0)] mb-4">
            CleanPlate · Blog
          </p>
          <h1
            className="font-[family-name:var(--font-display)] leading-tight"
            style={{ fontSize: "clamp(2rem, 6vw, 4rem)", letterSpacing: "0.02em" }}
          >
            GF Dining Guides
          </h1>
        </div>
      </section>

      {/* Post list */}
      <section className="px-4 md:px-8 py-10">
        <div className="max-w-4xl mx-auto">
          {posts.length === 0 ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.5_0_0)] py-16 text-center">
              Posts coming soon
            </p>
          ) : (
            <div className="space-y-0">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="block border-b py-6 md:py-8 px-2 md:px-4 transition-colors duration-150 hover:bg-[oklch(0.11_0_0)]"
                  style={{ borderColor: "oklch(0.18 0 0)" }}
                >
                  <time
                    dateTime={post.date}
                    className="font-mono text-[10px] uppercase tracking-[0.2em] text-[oklch(0.5_0_0)] block mb-2"
                  >
                    {formatDate(post.date)}
                  </time>
                  <h2
                    className="font-[family-name:var(--font-display)] leading-tight mb-2"
                    style={{ fontSize: "clamp(1.25rem, 3vw, 2rem)", letterSpacing: "0.02em", color: "oklch(0.95 0 0)" }}
                  >
                    {post.title}
                  </h2>
                  {post.description && (
                    <p className="text-[14px] leading-[1.65] text-[oklch(0.72_0_0)] line-clamp-2 max-w-2xl">
                      {post.description}
                    </p>
                  )}
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#FF7444] mt-3 inline-block">
                    Read →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
