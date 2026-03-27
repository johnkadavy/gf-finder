"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const linkClass =
  "font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.55_0_0)] hover:text-white transition-colors duration-200";

export function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-10">
        {pathname !== "/" && (
          <Link href="/" className={linkClass}>Search</Link>
        )}
        <Link href="/rankings" className={linkClass}>Rankings</Link>
        <Link href="/about" className={linkClass}>About</Link>
        <a
          href="https://airtable.com/appHZS7jRGolLejjZ/pagAO6Dy9uBO6pKfZ/form"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          Feedback
        </a>
      </nav>

      {/* Mobile hamburger button */}
      <button
        className="md:hidden flex flex-col justify-center items-center w-10 h-10 gap-[5px]"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
      >
        <span
          className="block w-5 h-px bg-[oklch(0.65_0_0)] transition-all duration-200 origin-center"
          style={mobileOpen ? { transform: "translateY(6px) rotate(45deg)" } : {}}
        />
        <span
          className="block w-5 h-px bg-[oklch(0.65_0_0)] transition-all duration-200"
          style={mobileOpen ? { opacity: 0 } : {}}
        />
        <span
          className="block w-5 h-px bg-[oklch(0.65_0_0)] transition-all duration-200 origin-center"
          style={mobileOpen ? { transform: "translateY(-6px) rotate(-45deg)" } : {}}
        />
      </button>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="md:hidden fixed top-16 left-0 right-0 z-40 border-b"
          style={{ backgroundColor: "oklch(0.08 0 0)", borderColor: "oklch(0.22 0 0)" }}
        >
          <nav className="flex flex-col px-6 py-4">
            {pathname !== "/" && (
              <Link
                href="/"
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.78_0_0)] py-4 border-b"
                style={{ borderColor: "oklch(0.18 0 0)" }}
              >
                Search
              </Link>
            )}
            <Link
              href="/rankings"
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.78_0_0)] py-4 border-b"
              style={{ borderColor: "oklch(0.18 0 0)" }}
            >
              Rankings
            </Link>
            <Link
              href="/about"
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.78_0_0)] py-4 border-b"
              style={{ borderColor: "oklch(0.18 0 0)" }}
            >
              About
            </Link>
            <a
              href="https://airtable.com/appHZS7jRGolLejjZ/pagAO6Dy9uBO6pKfZ/form"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.78_0_0)] py-4"
            >
              Feedback
            </a>
          </nav>
        </div>
      )}
    </>
  );
}
