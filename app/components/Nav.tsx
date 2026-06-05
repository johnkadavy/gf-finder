"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

const linkClass =
  "font-mono text-ui-md uppercase tracking-editorial text-text-label hover:text-white transition-colors duration-200";

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

function AskIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

const TABS = [
  { href: "/",         label: "Search",   Icon: SearchIcon   },
  { href: "/rankings", label: "Rankings", Icon: RankingsIcon },
  { href: "/ask",      label: "Ask",      Icon: AskIcon      },
  { href: "/map",      label: "Map",      Icon: MapIcon      },
];

export function Nav() {
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);
  const mobileNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setLoggedIn(!!user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  // iOS Safari: position: fixed elements don't track the visual viewport during
  // browser chrome animations. Listen to visualViewport and update bottom manually.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const nav = mobileNavRef.current;
      if (!nav) return;
      const offset = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
      nav.style.bottom = `${offset}px`;
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-10">
        {pathname !== "/" && (
          <Link href="/" className={linkClass}>Search</Link>
        )}
        <Link href="/rankings" className={linkClass}>Rankings</Link>
        <Link href="/ask" className={linkClass}>Ask</Link>
        <Link href="/map" className={linkClass}>Map</Link>
        <Link href="/about" className={linkClass}>About</Link>
        {/* Blog link hidden until posts exist */}
        {/* <Link href="/blog" className={linkClass}>Blog</Link> */}
        {loggedIn ? (
          <Link href="/account" className={linkClass}>Account</Link>
        ) : (
          <Link
            href="/login"
            className="font-mono text-ui-md uppercase tracking-editorial px-4 py-2 transition-colors duration-200"
            style={{ backgroundColor: "var(--accent)", color: "var(--surface-base)" }}
          >
            Sign Up Free
          </Link>
        )}
      </nav>

      {/* Mobile bottom tab bar */}
      <nav
        ref={mobileNavRef}
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t"
        style={{ backgroundColor: "var(--surface-base)", borderColor: "var(--border-subtle)" }}
      >
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors duration-150"
              style={{ color: active ? "var(--accent)" : "var(--text-label)" }}
            >
              <Icon />
              <span className="font-mono text-ui-xs uppercase tracking-label leading-none">
                {label}
              </span>
            </Link>
          );
        })}
        {!loggedIn && (
          <Link
            href="/login"
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors duration-150"
            style={{ color: "var(--accent)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="font-mono text-ui-xs uppercase tracking-label leading-none">Sign Up</span>
          </Link>
        )}
      </nav>
    </>
  );
}
