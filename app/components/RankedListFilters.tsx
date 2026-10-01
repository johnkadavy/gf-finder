"use client";

import { useState, type ReactNode } from "react";
import { capture } from "@/lib/analytics";

export type QuickFilter = {
  /** Must match a data-* flag RankedList puts on rows: excellent | fryer | labeled | kitchen */
  key: "excellent" | "fryer" | "labeled" | "kitchen";
  label: string;
  count: number;
  /** Status line while active, e.g. "11 with a dedicated fryer" */
  summary: string;
};

/**
 * In-place quick filters for a RankedList. Filtering is pure CSS: this sets
 * data-rl-filter on a wrapper and globals.css hides rows lacking the matching
 * flag — rows keep their original rank numbers, nothing is refetched.
 * Callers decide eligibility (see buildQuickFilters on landing pages); with
 * no filters this renders children only.
 */
export function RankedListFilters({
  filters,
  total,
  source,
  children,
}: {
  filters: QuickFilter[];
  total: number;
  source: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState<QuickFilter["key"] | null>(null);
  const activeFilter = filters.find((f) => f.key === active) ?? null;

  if (filters.length === 0) return <>{children}</>;

  const select = (key: QuickFilter["key"] | null) => {
    setActive(key);
    if (key) capture("rankings_filter_applied", { source, quick_filter: key });
  };

  const chipClass = "shrink-0 h-11 px-3.5 flex items-center gap-2 border font-mono text-ui-md uppercase tracking-snug whitespace-nowrap transition-colors duration-150";
  const chipStyle = (on: boolean) => ({
    borderColor: on ? "var(--accent)" : "var(--border-emphasis)",
    backgroundColor: on ? "var(--accent-tint-sm)" : "var(--surface-base)",
    color: on ? "var(--accent)" : "var(--text-label)",
  });

  return (
    <div data-rl-filter={active ?? undefined}>
      <div
        role="group"
        aria-label="Filter restaurants"
        className="sticky top-16 z-30 -mx-4 md:mx-0 px-4 md:px-0 py-2.5 flex gap-2 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ backgroundColor: "var(--surface-base)", borderColor: "var(--border-subtle)" }}
      >
        <button type="button" aria-pressed={!active} onClick={() => select(null)} className={chipClass} style={chipStyle(!active)}>
          All <span className="opacity-70">{total}</span>
        </button>
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={active === f.key}
            onClick={() => select(active === f.key ? null : f.key)}
            className={chipClass}
            style={chipStyle(active === f.key)}
          >
            {f.label} <span className="opacity-70">{f.count}</span>
          </button>
        ))}
      </div>

      {activeFilter && (
        <div className="flex items-center justify-between gap-3 pt-3" aria-live="polite">
          <span className="font-mono text-ui-sm font-medium uppercase tracking-label text-text-tertiary">
            {activeFilter.summary}
          </span>
          <button
            type="button"
            onClick={() => select(null)}
            className="h-11 -my-2 px-1 font-mono text-ui-sm uppercase tracking-label text-accent"
          >
            Clear ✕
          </button>
        </div>
      )}

      {children}
    </div>
  );
}
