"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState, useEffect, useRef } from "react";

type Suggestion = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
};

function Preloader() {
  return (
    <div className="flex items-center gap-1 px-5 py-3">
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

export function SearchForm({ initialQuery, cities = [], selectedCity = "all" }: {
  initialQuery: string;
  cities?: string[];
  selectedCity?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPreloader, setShowPreloader] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cityOpen, setCityOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);

  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const buildUrl = (q: string, city: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (city !== "all") params.set("city", city);
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  const fetchSuggestions = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);

    if (q.length === 0) {
      setSuggestions([]);
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
        const res = await fetch(`/api/suggestions?q=${encodeURIComponent(q)}${cityParam}`);
        const json = await res.json();
        // /api/suggestions returns { restaurants, cuisines }. Guard against the
        // older bare-array shape too, in case it ever changes back.
        const data: Suggestion[] = Array.isArray(json) ? json : (json.restaurants ?? []);
        setSuggestions(data);
        setIsOpen(data.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
        setShowPreloader(false);
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      }
    }, 280);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setValue(q);
    fetchSuggestions(q);
  };

  const selectSuggestion = (name: string) => {
    setValue(name);
    setIsOpen(false);
    setSuggestions([]);
    startTransition(() => {
      router.push(buildUrl(name, selectedCity));
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    setIsOpen(false);
    startTransition(() => {
      router.push(buildUrl(q, selectedCity));
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex].name);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const filteredCities = cities.filter((c) =>
    c.toLowerCase().includes(citySearch.toLowerCase())
  );

  return (
    <div ref={containerRef} className="max-w-2xl mx-auto">
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch">

        {/* Search input + suggestions */}
        <div className="flex-1 relative">
          <form onSubmit={handleSubmit}>
            <div
              className="flex items-center border px-5 py-3 transition-colors duration-200 focus-within:border-accent"
              style={{ backgroundColor: "var(--surface-raised)", borderColor: isOpen ? "var(--border-emphasis)" : "var(--border-default)" }}
            >
              <input
                type="text"
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setIsOpen(true)}
                placeholder="Search restaurants or neighborhoods…"
                autoComplete="off"
                className="bg-transparent border-none outline-none focus:ring-0 w-full font-mono text-sm placeholder:text-text-dim text-text-primary"
              />
              <button
                type="submit"
                disabled={isPending}
                className={`font-mono text-ui-md uppercase tracking-editorial px-6 py-2.5 border transition-all duration-200 whitespace-nowrap ml-4 ${isPending ? "opacity-50" : ""}`}
                style={{ borderColor: "var(--accent)", color: "var(--accent)", backgroundColor: "transparent" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent-foreground)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--accent)"; }}
              >
                Search
              </button>
            </div>
          </form>

          {/* Suggestions dropdown */}
          {(isOpen || (isLoading && showPreloader)) && (
            <div
              className="absolute top-full left-0 right-0 z-50 border border-t-0 overflow-hidden"
              style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--border-emphasis)" }}
            >
          {showPreloader && isLoading ? (
            <Preloader />
          ) : (
            suggestions.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={() => selectSuggestion(s.name)}
                onMouseEnter={() => setActiveIndex(i)}
                className="w-full text-left px-5 py-3 flex items-baseline justify-between gap-4 border-b transition-colors duration-100"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: i === activeIndex ? "var(--surface-overlay)" : "transparent",
                }}
              >
                <span className="font-mono text-sm text-text-primary truncate">
                  {/* Highlight matching portion */}
                  {highlightMatch(s.name, value)}
                </span>
                <span className="font-mono text-ui-sm uppercase tracking-label text-text-dim shrink-0">
                  {[s.neighborhood, s.city].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))
          )}
        </div>
          )}
        </div>

        {/* City filter */}
        {cities.length > 0 && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => { setCityOpen((o) => !o); if (!cityOpen) setCitySearch(""); }}
              className="w-full md:w-auto py-3 md:py-0 md:h-full flex items-center gap-2 font-mono text-ui-md uppercase tracking-label px-4 border transition-colors duration-150 whitespace-nowrap"
              style={{
                borderColor: selectedCity !== "all" ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
                backgroundColor: selectedCity !== "all" ? "var(--accent-tint-xs)" : "var(--surface-elevated)",
                color: selectedCity !== "all" ? "var(--accent)" : "var(--text-label)",
              }}
            >
              {selectedCity === "all" ? "All Cities" : selectedCity}
              {selectedCity !== "all" ? (
                <span
                  className="opacity-50 hover:opacity-100"
                  onMouseDown={(e) => { e.stopPropagation(); startTransition(() => router.push(buildUrl(value.trim(), "all"))); }}
                >✕</span>
              ) : (
                <span className="text-[9px] opacity-40">{cityOpen ? "▲" : "▼"}</span>
              )}
            </button>

            {cityOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setCityOpen(false)} />
                <div
                  className="absolute right-0 top-full z-20 min-w-[180px] border mt-px"
                  style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--border-emphasis)" }}
                >
                  {cities.length > 5 && (
                    <div className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search cities…"
                        value={citySearch}
                        onChange={(e) => setCitySearch(e.target.value)}
                        className="w-full bg-transparent font-mono text-ui-md px-4 py-2 outline-none placeholder:opacity-40"
                        style={{ color: "var(--text-secondary)" }}
                      />
                    </div>
                  )}
                  <div className="max-h-[240px] overflow-y-auto">
                    {!citySearch && (
                      <button
                        type="button"
                        onClick={() => { startTransition(() => router.push(buildUrl(value.trim(), "all"))); setCityOpen(false); }}
                        onMouseEnter={() => setHoveredCity("all")}
                        onMouseLeave={() => setHoveredCity(null)}
                        className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors"
                        style={{ borderColor: "var(--border-subtle)", color: selectedCity === "all" || hoveredCity === "all" ? "var(--accent)" : "var(--text-tertiary)", backgroundColor: selectedCity === "all" ? "var(--accent-tint-xs)" : hoveredCity === "all" ? "var(--accent-tint-xs)" : "transparent" }}
                      >
                        All Cities
                      </button>
                    )}
                    {filteredCities.map((city) => (
                      <button
                        type="button"
                        key={city}
                        onClick={() => { startTransition(() => router.push(buildUrl(value.trim(), city))); setCityOpen(false); setCitySearch(""); }}
                        onMouseEnter={() => setHoveredCity(city)}
                        onMouseLeave={() => setHoveredCity(null)}
                        className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors"
                        style={{ borderColor: "var(--border-subtle)", color: selectedCity === city || hoveredCity === city ? "var(--accent)" : "var(--text-tertiary)", backgroundColor: selectedCity === city ? "var(--accent-tint-xs)" : hoveredCity === city ? "var(--accent-tint-xs)" : "transparent" }}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>
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
