import Link from "next/link";
import type { QuickLink } from "@/app/page";

function ExploreTile({ link }: { link: QuickLink }) {
  return (
    <Link
      href={link.href}
      className="group flex flex-col justify-between gap-3 p-4 md:p-5 border transition-colors duration-150 hover:border-accent"
      style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-raised)" }}
    >
      <span
        className="font-[family-name:var(--font-display)] leading-tight text-text-primary group-hover:text-accent transition-colors"
        style={{ fontSize: "clamp(1.15rem, 3.2vw, 1.5rem)", letterSpacing: "0.02em" }}
      >
        {link.emoji && <span className="mr-2" aria-hidden="true">{link.emoji}</span>}
        {link.label}
      </span>
      <span className="font-mono text-ui-sm uppercase tracking-broad text-text-label leading-snug">
        {link.count} {link.count === 1 ? "spot" : "spots"}
      </span>
    </Link>
  );
}

function TileGroup({ heading, links }: { heading: string; links: QuickLink[] }) {
  if (links.length === 0) return null;
  return (
    <div>
      <h2 className="font-mono text-ui-md uppercase tracking-stamp mb-4" style={{ color: "var(--text-label)" }}>
        {heading}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {links.map((l) => <ExploreTile key={l.href} link={l} />)}
      </div>
    </div>
  );
}

export function ExploreSection({
  neighborhoods,
  categories,
}: {
  neighborhoods: QuickLink[];
  categories: QuickLink[];
}) {
  if (neighborhoods.length === 0 && categories.length === 0) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 md:px-8 pt-4 md:pt-10 pb-10 space-y-10">
      <TileGroup heading="Browse by cuisine & type" links={categories} />
      <TileGroup heading="Browse by neighborhood" links={neighborhoods} />
      <div>
        <Link
          href="/rankings"
          className="font-mono text-ui-sm uppercase tracking-label transition-colors hover:text-accent"
          style={{ color: "var(--text-dim)" }}
        >
          See all rankings →
        </Link>
      </div>
    </section>
  );
}
