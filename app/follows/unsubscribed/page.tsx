import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Unsubscribed | CleanPlate", robots: "noindex" };

export default function UnsubscribedPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-sm w-full space-y-6 text-center">
        <p
          className="font-mono text-ui-xs uppercase tracking-stamp"
          style={{ color: "var(--text-disabled)" }}
        >
          CleanPlate
        </p>

        <p
          className="font-[family-name:var(--font-display)] leading-tight"
          style={{ fontSize: "clamp(2rem, 8vw, 3rem)", color: "var(--text-secondary)" }}
        >
          Unsubscribed.
        </p>

        <p
          className="font-mono text-ui-md uppercase tracking-label"
          style={{ color: "var(--text-tertiary)" }}
        >
          You won&rsquo;t receive any more emails for this follow. You can always follow again from the rankings page.
        </p>

        <Link
          href="/rankings"
          className="inline-block font-mono text-ui-sm uppercase tracking-label border px-4 py-2.5 transition-colors hover:border-accent hover:text-accent"
          style={{ borderColor: "var(--border-emphasis)", color: "var(--text-label)" }}
        >
          ← Back to Rankings
        </Link>
      </div>
    </main>
  );
}
