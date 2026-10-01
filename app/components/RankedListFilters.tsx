"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { capture } from "@/lib/analytics";

export type QuickFilterKey = "excellent" | "fryer" | "labeled" | "kitchen";

export type QuickFilter = {
  /** Must match a data-* flag RankedList puts on rows */
  key: QuickFilterKey;
  label: string;
  count: number;
};

export type CuisineOption = {
  /** cuisineFilterKey() — matches data-cuisine on RankedList rows */
  key: string;
  label: string;
  count: number;
};

/** Compact per-row facts, in list order, so the status line can count combinations. */
export type FilterRowMeta = { flags: QuickFilterKey[]; cuisine: string | null };

const QUICK_SUFFIX: Record<QuickFilterKey, string> = {
  excellent: "scored 85+",
  fryer: "with a dedicated fryer",
  labeled: "with a labeled GF menu",
  kitchen: "with a dedicated GF kitchen",
};

/**
 * In-place filters for a RankedList: one quick filter + one cuisine, combined
 * (AND). Filtering is CSS-only — rows stay server-rendered, keep their rank
 * numbers, and nothing is refetched. Quick filters hide rows via globals.css
 * ([data-rl-filter]); the cuisine filter injects a scoped rule below.
 * Callers decide eligibility; with nothing to offer this renders children only.
 */
export function RankedListFilters({
  filters,
  cuisines,
  rows,
  source,
  children,
}: {
  filters: QuickFilter[];
  cuisines: CuisineOption[];
  rows: FilterRowMeta[];
  source: string;
  children: ReactNode;
}) {
  const [quick, setQuick] = useState<QuickFilterKey | null>(null);
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const scope = useId().replace(/[^a-zA-Z0-9]/g, "");

  // Close the desktop cuisine menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (filters.length === 0 && cuisines.length === 0) return <>{children}</>;

  const total = rows.length;
  const activeCuisine = cuisines.find((c) => c.key === cuisine) ?? null;
  const shown = rows.filter(
    (r) => (!quick || r.flags.includes(quick)) && (!cuisine || r.cuisine === cuisine),
  ).length;

  const selectQuick = (key: QuickFilterKey | null) => {
    setQuick(key);
    if (key) capture("rankings_filter_applied", { source, quick_filter: key, cuisine });
  };
  const selectCuisine = (key: string | null) => {
    setCuisine(key);
    setMenuOpen(false);
    if (key) capture("rankings_filter_applied", { source, cuisine: key, quick_filter: quick });
  };
  const clearAll = () => { setQuick(null); setCuisine(null); };

  const chipClass =
    "shrink-0 h-11 px-3.5 flex items-center gap-2 border font-mono text-ui-md uppercase tracking-snug whitespace-nowrap transition-colors duration-150";
  const chipStyle = (on: boolean) => ({
    borderColor: on ? "var(--accent)" : "var(--border-emphasis)",
    backgroundColor: on ? "var(--accent-tint-sm)" : "var(--surface-base)",
    color: on ? "var(--accent)" : "var(--text-label)",
  });

  const noun = shown === 1 ? "restaurant" : "restaurants";
  const status = [
    String(shown),
    activeCuisine?.label,
    noun,
    quick ? QUICK_SUFFIX[quick] : null,
  ].filter(Boolean).join(" ");

  const cuisineChipLabel = activeCuisine ? (
    <>
      {activeCuisine.label} <span className="opacity-70">{activeCuisine.count}</span>
    </>
  ) : (
    <>Cuisine <span aria-hidden="true" className="opacity-70">▾</span></>
  );

  return (
    <div data-rl-filter={quick ?? undefined} data-rl-scope={scope}>
      {cuisine && (
        <style>{`[data-rl-scope="${scope}"] [data-rl-row]:not([data-cuisine="${cuisine}"]){display:none}`}</style>
      )}

      <div
        role="group"
        aria-label="Filter restaurants"
        className="sticky top-16 z-30 -mx-4 md:mx-0 px-4 md:px-0 py-2.5 flex items-center gap-2 overflow-x-auto md:overflow-visible border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ backgroundColor: "var(--surface-base)", borderColor: "var(--border-subtle)" }}
      >
        <button type="button" aria-pressed={!quick && !cuisine} onClick={clearAll} className={chipClass} style={chipStyle(!quick && !cuisine)}>
          All <span className="opacity-70">{total}</span>
        </button>
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={quick === f.key}
            onClick={() => selectQuick(quick === f.key ? null : f.key)}
            className={chipClass}
            style={chipStyle(quick === f.key)}
          >
            {f.label} <span className="opacity-70">{f.count}</span>
          </button>
        ))}

        {cuisines.length > 0 && (
          <>
            {filters.length > 0 && (
              <span aria-hidden="true" className="shrink-0 w-px h-7 mx-1" style={{ backgroundColor: "var(--border-emphasis)" }} />
            )}

            {/* Phones: native picker under a chip-styled overlay */}
            <div className="md:hidden shrink-0 flex items-stretch">
              <label className={`${chipClass} relative`} style={chipStyle(!!activeCuisine)}>
                {cuisineChipLabel}
                <select
                  aria-label="Cuisine"
                  value={cuisine ?? ""}
                  onChange={(e) => selectCuisine(e.target.value || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                >
                  <option value="">Any cuisine ({total})</option>
                  {cuisines.map((c) => (
                    <option key={c.key} value={c.key}>{c.label} ({c.count})</option>
                  ))}
                </select>
              </label>
              {activeCuisine && (
                <button
                  type="button"
                  aria-label={`Clear ${activeCuisine.label}`}
                  onClick={() => selectCuisine(null)}
                  className="h-11 w-10 -ml-px flex items-center justify-center border font-mono text-ui-md"
                  style={chipStyle(true)}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Desktop: chip + menu */}
            <div ref={menuRef} className="hidden md:flex relative shrink-0 items-stretch">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className={chipClass}
                style={menuOpen && !activeCuisine
                  ? { ...chipStyle(false), borderColor: "var(--text-label)", color: "var(--text-primary)" }
                  : chipStyle(!!activeCuisine)}
              >
                {cuisineChipLabel}
              </button>
              {activeCuisine && (
                <button
                  type="button"
                  aria-label={`Clear ${activeCuisine.label}`}
                  onClick={() => selectCuisine(null)}
                  className="h-11 w-10 -ml-px flex items-center justify-center border font-mono text-ui-md"
                  style={chipStyle(true)}
                >
                  ✕
                </button>
              )}
              {menuOpen && (
                <div
                  role="listbox"
                  aria-label="Cuisine"
                  className="absolute left-0 top-full mt-2 z-40 w-64 border shadow-lg"
                  style={{ backgroundColor: "var(--surface-overlay)", borderColor: "var(--border-emphasis)" }}
                >
                  <p className="px-3.5 py-2 border-b font-mono text-ui-sm uppercase tracking-label text-text-dim" style={{ borderColor: "var(--border-subtle)" }}>
                    Cuisine
                  </p>
                  {[{ key: "", label: "Any", count: total }, ...cuisines].map((c) => {
                    const on = (cuisine ?? "") === c.key;
                    return (
                      <button
                        key={c.key || "any"}
                        type="button"
                        role="option"
                        aria-selected={on}
                        onClick={() => selectCuisine(c.key || null)}
                        className="w-full flex items-center justify-between min-h-10 px-3.5 border-b font-mono text-ui-md uppercase tracking-snug text-left transition-colors hover:text-accent"
                        style={{
                          borderColor: "var(--border-subtle)",
                          color: on ? "var(--accent)" : "var(--text-label)",
                          backgroundColor: on ? "var(--accent-tint-xs)" : "transparent",
                        }}
                      >
                        <span>{c.label}</span>
                        <span className="text-text-dim">{c.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {(quick || cuisine) && (
        <div className="flex items-center justify-between gap-3 pt-3" aria-live="polite">
          <span className="font-mono text-ui-sm font-medium uppercase tracking-label text-text-tertiary">
            {shown === 0 ? "No matches for this combination" : status}
          </span>
          <button
            type="button"
            onClick={clearAll}
            className="h-11 -my-2 px-1 font-mono text-ui-sm uppercase tracking-label text-accent"
          >
            Clear all ✕
          </button>
        </div>
      )}

      {children}
    </div>
  );
}
