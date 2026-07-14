"use client";

import { useEffect, useState } from "react";

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export function ThemeToggle() {
  // null until mounted; matches SSR (sun icon) on first client render, then syncs.
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, []);

  function toggle() {
    const el = document.documentElement;
    const next = el.classList.contains("light") ? "dark" : "light";
    el.classList.remove("light", "dark");
    el.classList.add(next);
    try { localStorage.setItem("theme", next); } catch { /* ignore */ }
    setTheme(next);
  }

  const showMoon = theme === "light";

  return (
    <button
      onClick={toggle}
      aria-label={showMoon ? "Switch to dark mode" : "Switch to light mode"}
      className="flex items-center justify-center w-8 h-8 transition-colors duration-200"
      style={{ color: "var(--text-label)" }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-label)"; }}
    >
      {/* Icon shows the theme you'll switch TO. */}
      {showMoon ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
