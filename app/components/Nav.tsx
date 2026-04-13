"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

const linkClass =
  "font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.55_0_0)] hover:text-white transition-colors duration-200";

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <circle cx="11" cy="11" r="7.5" />
      <path d="M17.5 17.5L22 22" />
    </svg>
  );
}

function RankingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="12" width="6" height="9" />
      <rect x="9" y="7" width="6" height="14" />
      <rect x="16" y="10" width="6" height="11" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3z" />
      <path d="M9 3v15M15 6v15" />
    </svg>
  );
}

const TABS = [
  { href: "/",         label: "Search",   Icon: SearchIcon   },
  { href: "/rankings", label: "Rankings", Icon: RankingsIcon },
  { href: "/map",      label: "Map",      Icon: MapIcon      },
];

export function Nav() {
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setLoggedIn(!!user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-10">
        {pathname !== "/" && (
          <Link href="/" className={linkClass}>Search</Link>
        )}
        <Link href="/rankings" className={linkClass}>Rankings</Link>
        <Link href="/map" className={linkClass}>Map</Link>
        <Link href="/about" className={linkClass}>About</Link>
        {loggedIn && (
          <Link href="/account" className={linkClass}>Account</Link>
        )}
      </nav>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t"
        style={{ backgroundColor: "oklch(0.08 0 0)", borderColor: "oklch(0.18 0 0)" }}
      >
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors duration-150"
              style={{ color: active ? "#FF7444" : "oklch(0.48 0 0)" }}
            >
              <Icon />
              <span className="font-mono text-[9px] uppercase tracking-[0.15em] leading-none">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
