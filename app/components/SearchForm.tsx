"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, useState, useEffect, useRef, useId } from "react";
import { capture } from "@/lib/analytics";
import { getGaugeColor, getScoreLabel } from "@/lib/score";

type RestaurantSuggestion = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
  slug: string | null;
  score: number | null;
};

type LinkSuggestion = { label: string; href: string; count: number; emoji?: string };

type SuggestionData = {
  restaurants: RestaurantSuggestion[];
  neighborhoods: LinkSuggestion[];
  categories: LinkSuggestion[];
};

type Item =
  | { kind: "neighborhood"; link: LinkSuggestion }
  | { kind: "category"; link: LinkSuggestion }
  | { kind: "restaurant"; r: RestaurantSuggestion }
  | { kind: "all" };

const EMPTY: SuggestionData = { restaurants: [], neighborhoods: [], categories: [] };
const MOBILE_QUERY = "(max-width: 767px)";

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-text-dim">
      <circle cx="11" cy="11" r="7.5" />
      <path d="M17.5 17.5L22 22" />
    </svg>
  );
}

function Preloader() {
  return (
    <div className="flex items-center gap-1 px-4 py-4">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span
          key={i}
          className="block w-px h-3"
          style={{
            backgroundColor: "var(--text-disabled)",
            animation: `scanBar 1s ease-in-out ${i * 0.08}s infinite alternate`,
          }}
        />
      ))}
      <span className="font-mono text-ui-sm uppercase tracking-editorial text-text-dim ml-3">
        Scanning
      </span>
      <style>{`
        @keyframes scanBar {
          from { transform: scaleY(0.3); opacity: 0.3; }
          to   { transform: scaleY(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/**
 * Homepage search.
 * - `hero`: large field + Search button (idle homepage).
 * - `compact`: back arrow + field, used as the sticky bar above results.
 * On phones, focusing the field enters "focus mode": the form becomes a
 * full-screen layer with the field pinned at the top, so suggestions sit
 * above the keyboard instead of behind it. Desktop keeps a dropdown.
 */
export function SearchForm({
  initialQuery,
  selectedCity = "all",
  variant = "hero",
}: {
  initialQuery: string;
  selectedCity?: string;
  variant?: "hero" | "compact";
}) {
  const router = useRouter();
  const formId = useId();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(initialQuery);
  const [data, setData] = useState<SuggestionData>(EMPTY);
  const [isLoading, setIsLoading] = useState(false);
  const [showPreloader, setShowPreloader] = useState(false);
  const [isOpen, setIsOpen] = useState(false);      // desktop dropdown
  const [overlay, setOverlay] = useState(false);    // mobile focus mode
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  // Close desktop dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Lock page scroll behind the mobile focus layer
  useEffect(() => {
    if (!overlay) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [overlay]);

  const q = value.trim();

  const items: Item[] = [
    ...data.neighborhoods.map((link) => ({ kind: "neighborhood" as const, link })),
    ...data.categories.map((link) => ({ kind: "category" as const, link })),
    ...data.restaurants.map((r) => ({ kind: "restaurant" as const, r })),
    ...(q ? [{ kind: "all" as const }] : []),
  ];
  const hasSuggestions = items.some((i) => i.kind !== "all");

  const buildUrl = (query: string, city: string) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (city !== "all") params.set("city", city);
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  const fetchSuggestions = (text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);

    if (text.trim().length === 0) {
      setData(EMPTY);
      setIsOpen(false);
      setIsLoading(false);
      setShowPreloader(false);
      return;
    }

    setIsLoading(true);
    setShowPreloader(false);
    // Show preloader only if taking longer than 400ms
    slowTimerRef.current = setTimeout(() => setShowPreloader(true), 400);

    debounceRef.current = setTimeout(async () => {
      try {
        const cityParam = selectedCity !== "all" ? `&city=${encodeURIComponent(selectedCity)}` : "";
        const res = await fetch(`/api/suggestions?q=${encodeURIComponent(text.trim())}${cityParam}`);
        const json = await res.json();
        const next: SuggestionData = {
          restaurants: Array.isArray(json) ? json : (json.restaurants ?? []),
          neighborhoods: json.neighborhoods ?? [],
          categories: json.categories ?? [],
        };
        setData(next);
        const any = next.restaurants.length + next.neighborhoods.length + next.categories.length > 0;
        setIsOpen(any && !window.matchMedia(MOBILE_QUERY).matches);
        setActiveIndex(-1);
      } catch {
        setData(EMPTY);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
        setShowPreloader(false);
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      }
    }, 280);
  };

  const exitFocus = () => {
    setIsOpen(false);
    setOverlay(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const navigate = (href: string) => {
    exitFocus();
    startTransition(() => router.push(href));
  };

  const submit = (source: "typed" | "see_all") => {
    exitFocus();
    if (q) capture("home_search_submitted", { query: q, city: selectedCity, source });
    startTransition(() => router.push(buildUrl(q, selectedCity)));
  };

  const selectItem = (item: Item, index: number) => {
    if (item.kind === "all") return submit("see_all");
    if (item.kind === "restaurant") {
      capture("search_result_clicked", {
        query: q, kind: "restaurant", source: "suggestion", position: index,
        restaurant_id: item.r.id, score: item.r.score,
      });
      return navigate(`/restaurant/${item.r.slug ?? item.r.id}`);
    }
    capture("search_result_clicked", { query: q, kind: item.kind, source: "suggestion", position: index, href: item.link.href });
    navigate(item.link.href);
  };

  const cancel = () => {
    setValue(initialQuery);
    setData(EMPTY);
    exitFocus();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    fetchSuggestions(e.target.value);
  };

  const handleFocus = () => {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setOverlay(true);
      if (q && !hasSuggestions) fetchSuggestions(value);
    } else if (hasSuggestions) {
      setIsOpen(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const active = activeIndex >= 0 ? items[activeIndex] : null;
    if (active) return selectItem(active, activeIndex);
    submit("typed");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (overlay) cancel();
      else { setIsOpen(false); setActiveIndex(-1); }
      return;
    }
    if (!isOpen && !overlay) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    }
  };

  const clear = () => {
    setValue("");
    fetchSuggestions("");
    inputRef.current?.focus();
  };

  // ── Suggestion list (shared by mobile layer + desktop dropdown) ─────────────
  const groupLabel = (text: string) => (
    <div className="px-4 pt-4 pb-1.5 font-mono text-ui-sm font-medium uppercase tracking-label text-text-tertiary">
      {text}
    </div>
  );

  const rowClass = "w-full text-left flex items-center gap-3 min-h-13 px-4 py-1.5 border-b transition-colors duration-100";
  const rowStyle = (i: number) => ({
    borderColor: "var(--border-subtle)",
    backgroundColor: i === activeIndex ? "var(--surface-overlay)" : "transparent",
  });

  const renderItem = (item: Item, i: number) => {
    const common = {
      type: "button" as const,
      // mousedown (not click) so the desktop input's blur doesn't close the list first
      onMouseDown: (e: React.MouseEvent) => { e.preventDefault(); selectItem(item, i); },
      onMouseEnter: () => setActiveIndex(i),
      className: rowClass,
      style: rowStyle(i),
    };

    if (item.kind === "all") {
      return (
        <button key="all" {...common} className={`${rowClass} justify-between`}>
          <span className="font-mono text-ui-md uppercase tracking-label text-accent truncate">
            See all results for &ldquo;{q}&rdquo;
          </span>
          <span className="font-mono text-ui-md text-accent" aria-hidden="true">→</span>
        </button>
      );
    }

    if (item.kind === "restaurant") {
      const { r } = item;
      const color = getGaugeColor(r.score);
      return (
        <button key={`r-${r.id}`} {...common}>
          <span
            className="w-9 h-8 shrink-0 flex items-center justify-center border font-[family-name:var(--font-display)] text-xl leading-none pt-0.5"
            style={{ color, borderColor: color }}
            aria-label={r.score !== null ? `Score ${r.score}` : "Not yet scored"}
          >
            {r.score ?? "—"}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-sans text-ui-2xl font-medium text-text-primary truncate">
              {highlightMatch(r.name, q)}
            </span>
            <span className="block font-mono text-ui-sm uppercase tracking-label text-text-dim truncate mt-0.5">
              {[r.neighborhood ?? r.city, getScoreLabel(r.score).label].filter(Boolean).join(" · ")}
            </span>
          </span>
        </button>
      );
    }

    const { link } = item;
    return (
      <button key={`${item.kind}-${link.href}`} {...common}>
        <span
          className="w-9 h-8 shrink-0 flex items-center justify-center border text-ui-xl text-text-label"
          style={{ borderColor: "var(--border-default)" }}
          aria-hidden="true"
        >
          {link.emoji ?? "⌖"}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-sans text-ui-2xl font-medium text-text-primary truncate">
            {highlightMatch(link.label, q)}
          </span>
          <span className="block font-mono text-ui-sm uppercase tracking-label text-text-dim mt-0.5">
            {link.count} rated 75+
          </span>
        </span>
        <span className="font-mono text-ui-md text-text-dim" aria-hidden="true">→</span>
      </button>
    );
  };

  const renderList = () => {
    if (showPreloader && isLoading) return <Preloader />;
    const nb = items.filter((i) => i.kind === "neighborhood" || i.kind === "category");
    const rs = items.filter((i) => i.kind === "restaurant");
    const all = items.filter((i) => i.kind === "all");
    let idx = 0;
    return (
      <>
        {nb.length > 0 && groupLabel(nb.some((i) => i.kind === "neighborhood") ? "Neighborhoods & guides" : "Guides")}
        {nb.map((item) => renderItem(item, idx++))}
        {rs.length > 0 && groupLabel("Restaurants")}
        {rs.map((item) => renderItem(item, idx++))}
        {all.map((item) => renderItem(item, idx++))}
      </>
    );
  };

  // ── Layout ──────────────────────────────────────────────────────────────────
  const isHero = variant === "hero";

  return (
    <div
      ref={containerRef}
      className={
        overlay
          ? "fixed inset-0 z-[60] flex flex-col bg-surface-base text-left"
          : `relative w-full text-left ${isHero ? "max-w-2xl mx-auto" : ""}`
      }
      style={overlay ? { paddingTop: "env(safe-area-inset-top)" } : undefined}
    >
      <form
        id={formId}
        role="search"
        onSubmit={handleSubmit}
        className={overlay ? "flex items-center gap-2 px-3 py-2 border-b" : "flex items-center gap-2"}
        style={overlay ? { borderColor: "var(--border-subtle)" } : undefined}
      >
        {!isHero && !overlay && (
          <Link
            href="/"
            aria-label="Back to home"
            className="w-10 h-12 shrink-0 -ml-2 flex items-center justify-center font-mono text-ui-2xl text-text-label hover:text-accent transition-colors"
          >
            ←
          </Link>
        )}

        <div
          className={`flex-1 min-w-0 flex items-center gap-2.5 border pl-4 pr-1 transition-colors duration-200 focus-within:border-accent ${
            isHero && !overlay ? "h-13 md:h-16" : "h-12"
          }`}
          style={{
            backgroundColor: "var(--surface-raised)",
            borderColor: isOpen ? "var(--border-emphasis)" : "var(--border-default)",
          }}
        >
          <SearchIcon />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            inputMode="search"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder="Restaurant, area, cuisine"
            aria-label="Search restaurants, neighborhoods, or cuisines"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent border-none outline-none focus:ring-0 font-mono text-ui-body placeholder:text-text-dim text-text-primary [&::-webkit-search-cancel-button]:appearance-none"
          />
          {value && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clear}
              aria-label="Clear search"
              className="w-11 h-11 shrink-0 flex items-center justify-center font-mono text-ui-xl text-text-dim hover:text-text-primary transition-colors"
            >
              ✕
            </button>
          )}
          {isHero && (
            <button
              type="submit"
              disabled={isPending}
              className={`hidden md:inline-flex items-center font-mono text-ui-md uppercase tracking-editorial px-6 py-2.5 border transition-all duration-200 whitespace-nowrap ml-2 mr-1.5 ${isPending ? "opacity-50" : ""}`}
              style={{ borderColor: "var(--accent)", color: "var(--accent)", backgroundColor: "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent-foreground)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--accent)"; }}
            >
              Search
            </button>
          )}
        </div>

        {overlay && (
          <button
            type="button"
            onClick={cancel}
            className="h-12 px-2 shrink-0 font-mono text-ui-md uppercase tracking-label text-text-label"
          >
            Cancel
          </button>
        )}
      </form>

      {/* Mobile-only full-width submit on the idle hero */}
      {isHero && !overlay && (
        <button
          type="submit"
          form={formId}
          disabled={isPending}
          className={`md:hidden w-full mt-2 h-13 font-mono text-ui-md uppercase tracking-editorial border transition-colors duration-200 ${isPending ? "opacity-50" : ""}`}
          style={{ borderColor: "var(--accent)", backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
        >
          Search
        </button>
      )}

      {/* Mobile focus layer: suggestions above the keyboard */}
      {overlay && (
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {q ? (
            renderList()
          ) : (
            <p className="px-4 py-5 font-sans text-ui-2xl leading-normal text-text-tertiary">
              Search by restaurant name, neighborhood, or cuisine.
            </p>
          )}
        </div>
      )}

      {/* Desktop dropdown */}
      {!overlay && (isOpen || (isLoading && showPreloader && q.length > 0)) && (
        <div
          className="hidden md:block absolute top-full left-0 right-0 z-50 border border-t-0 overflow-hidden"
          style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--border-emphasis)" }}
        >
          {renderList()}
        </div>
      )}
    </div>
  );
}

function highlightMatch(name: string, query: string) {
  if (!query) return <>{name}</>;
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{name}</>;
  return (
    <>
      {name.slice(0, idx)}
      <span style={{ color: "var(--accent)" }}>{name.slice(idx, idx + query.length)}</span>
      {name.slice(idx + query.length)}
    </>
  );
}
