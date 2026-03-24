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
          className="block w-px h-3 bg-[oklch(0.35_0_0)]"
          style={{
            animation: `scanBar 1s ease-in-out ${i * 0.08}s infinite alternate`,
          }}
        />
      ))}
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[oklch(0.38_0_0)] ml-3">
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

export function SearchForm({ initialQuery }: { initialQuery: string }) {
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
        const res = await fetch(`/api/suggestions?q=${encodeURIComponent(q)}`);
        const data: Suggestion[] = await res.json();
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
      router.push(`/?q=${encodeURIComponent(name)}`);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    setIsOpen(false);
    startTransition(() => {
      router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
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

  return (
    <div ref={containerRef} className="max-w-2xl mx-auto relative">
      <form onSubmit={handleSubmit}>
        <div
          className="flex items-center border px-5 py-3 transition-colors duration-200 focus-within:border-[#FF7444]"
          style={{ backgroundColor: "oklch(0.12 0 0)", borderColor: isOpen ? "oklch(0.35 0 0)" : "oklch(0.28 0 0)" }}
        >
          <input
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setIsOpen(true)}
            placeholder="Type a restaurant to check gluten-free safety"
            autoComplete="off"
            className="bg-transparent border-none outline-none focus:ring-0 w-full font-mono text-sm placeholder:text-[oklch(0.38_0_0)] text-white"
          />
          <button
            type="submit"
            disabled={isPending}
            className={`font-mono text-[11px] uppercase tracking-[0.2em] px-6 py-2.5 border border-[#FF7444] text-[#FF7444] hover:bg-[#FF7444] hover:text-black transition-all duration-200 whitespace-nowrap ml-4 ${isPending ? "opacity-50" : ""}`}
          >
            Check a Restaurant
          </button>
        </div>
      </form>

      {/* Dropdown */}
      {(isOpen || (isLoading && showPreloader)) && (
        <div
          className="absolute top-full left-0 right-0 z-50 border border-t-0 overflow-hidden"
          style={{ backgroundColor: "oklch(0.11 0 0)", borderColor: "oklch(0.28 0 0)" }}
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
                  borderColor: "oklch(0.18 0 0)",
                  backgroundColor: i === activeIndex ? "oklch(0.16 0 0)" : "transparent",
                }}
              >
                <span className="font-mono text-sm text-white truncate">
                  {/* Highlight matching portion */}
                  {highlightMatch(s.name, value)}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.4_0_0)] shrink-0">
                  {[s.neighborhood, s.city].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))
          )}
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
      <span style={{ color: "#FF7444" }}>{name.slice(idx, idx + query.length)}</span>
      {name.slice(idx + query.length)}
    </>
  );
}
