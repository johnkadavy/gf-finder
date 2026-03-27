"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex items-center gap-10">
      {pathname !== "/" && (
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.55_0_0)] hover:text-white transition-colors duration-200"
        >
          Search
        </Link>
      )}
      <Link
        href="/rankings"
        className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.55_0_0)] hover:text-white transition-colors duration-200"
      >
        Rankings
      </Link>
      <Link
        href="/about"
        className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.55_0_0)] hover:text-white transition-colors duration-200"
      >
        About
      </Link>
      <a
        href="https://airtable.com/appHZS7jRGolLejjZ/pagAO6Dy9uBO6pKfZ/form"
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.55_0_0)] hover:text-white transition-colors duration-200"
      >
        Feedback
      </a>
    </nav>
  );
}
