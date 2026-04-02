"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import Link from "next/link";
import type { MapRestaurant } from "./types";

import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

type ScoreFilter = "excellent" | "great" | "all";

const SCORE_FILTERS: { value: ScoreFilter; label: string; min: number }[] = [
  { value: "excellent", label: "Excellent", min: 85 },
  { value: "great",    label: "Great+",    min: 75 },
  { value: "all",      label: "All",       min: 0  },
];

function meetsScoreFilter(r: MapRestaurant, filter: ScoreFilter): boolean {
  return (r.score ?? 0) >= SCORE_FILTERS.find((f) => f.value === filter)!.min;
}

function priceStr(level: number | null) {
  return level ? "$".repeat(level) : null;
}

export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const markerEls = useRef<Map<number, HTMLElement>>(new Map());
  const searchMode = useRef(false);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef<MapRestaurant | null>(null);
  const selectedIdRef = useRef<number | null>(null); // for use inside DOM event listeners

  const [mapReady, setMapReady] = useState(false);
  const [restaurants, setRestaurants] = useState<MapRestaurant[]>([]);
  const [selected, setSelected] = useState<MapRestaurant | null>(null);
  // Keep refs in sync so viewport fetch and DOM listeners can read current selected
  useEffect(() => {
    selectedRef.current = selected;
    selectedIdRef.current = selected?.id ?? null;
  }, [selected]);
  const [hovered, setHovered] = useState<{ r: MapRestaurant; x: number; y: number } | null>(null);
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Autocomplete
  const [suggestions, setSuggestions] = useState<{ id: number; name: string; city: string; neighborhood: string | null }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const handleMarkerHover = useCallback((r: MapRestaurant) => {
    const pos = map.current?.project([r.lng, r.lat]);
    if (pos) setHovered({ r, x: pos.x, y: pos.y });
  }, []);
  const handleMarkerLeave = useCallback(() => setHovered(null), []);
  const handleMarkerClick = useCallback((r: MapRestaurant) => {
    setSelected((prev) => (prev?.id === r.id ? null : r));
  }, []);

  const createMarkerEl = useCallback((r: MapRestaurant, visible: boolean): HTMLElement => {
    const el = document.createElement("div");
    el.style.cssText = `width: 28px; height: 28px; cursor: pointer;${visible ? "" : " display: none;"}`;

    const inner = document.createElement("div");
    inner.style.cssText = `
      width: 28px; height: 28px; border-radius: 50%;
      background-color: ${r.color}; border: 2px solid rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      font-family: monospace; font-size: 9px; font-weight: 700; color: #111;
      box-shadow: 0 0 0 2px ${r.color}40;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    `;
    inner.textContent = r.score !== null ? String(r.score) : "?";
    el.appendChild(inner);

    el.addEventListener("mouseenter", () => {
      if (selectedIdRef.current !== r.id) {
        inner.style.transform = "scale(1.3)";
        inner.style.boxShadow = `0 0 0 4px ${r.color}60`;
      }
      handleMarkerHover(r);
    });
    el.addEventListener("mouseleave", () => {
      if (selectedIdRef.current !== r.id) {
        inner.style.transform = "scale(1)";
        inner.style.boxShadow = `0 0 0 2px ${r.color}40`;
      }
      handleMarkerLeave();
    });
    el.addEventListener("click", () => handleMarkerClick(r));

    return el;
  }, [handleMarkerHover, handleMarkerLeave, handleMarkerClick]);

  // Fetch top restaurants for the current map viewport
  const fetchViewport = useCallback(async () => {
    if (!map.current) return;
    const bounds = map.current.getBounds();
    if (!bounds) return;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const params = new URLSearchParams({
      swLat: String(sw.lat), swLng: String(sw.lng),
      neLat: String(ne.lat), neLng: String(ne.lng),
    });
    setIsSearching(true);
    try {
      const res = await fetch(`/api/map-search?${params}`);
      const data: MapRestaurant[] = await res.json();
      // Always keep the currently-selected restaurant in the list so its
      // marker stays visible even if it falls outside the top-50 by score.
      const pinned = selectedRef.current;
      if (pinned && !data.some((r) => r.id === pinned.id)) {
        data.push(pinned);
      }
      setRestaurants(data);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Init map + attach moveend listener
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-73.985, 40.758],
      zoom: 12,
    });
    map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    map.current.on("load", () => setMapReady(true));

    map.current.on("moveend", () => {
      if (searchMode.current) return;
      if (moveTimer.current) clearTimeout(moveTimer.current);
      moveTimer.current = setTimeout(fetchViewport, 600);
    });

    return () => {
      if (moveTimer.current) clearTimeout(moveTimer.current);
      map.current?.remove();
      map.current = null;
      markers.current.clear();
      markerEls.current.clear();
    };
  }, [fetchViewport]);

  // Initial viewport fetch once map is ready
  useEffect(() => {
    if (mapReady) fetchViewport();
  }, [mapReady, fetchViewport]);

  // Sync markers whenever the restaurant list changes
  useEffect(() => {
    if (!mapReady || !map.current) return;

    const newIds = new Set(restaurants.map((r) => r.id));

    // Remove stale markers
    markers.current.forEach((marker, id) => {
      if (!newIds.has(id)) {
        marker.remove();
        markers.current.delete(id);
        markerEls.current.delete(id);
      }
    });

    // Add new markers
    restaurants.forEach((r) => {
      if (markers.current.has(r.id)) return;
      const el = createMarkerEl(r, meetsScoreFilter(r, scoreFilter));
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([r.lng, r.lat])
        .addTo(map.current!);
      markers.current.set(r.id, marker);
      markerEls.current.set(r.id, el);
    });
  }, [mapReady, restaurants, scoreFilter, createMarkerEl]);

  // Apply / remove selected marker highlight
  useEffect(() => {
    const restaurantMap = new Map(restaurants.map((r) => [r.id, r]));
    markerEls.current.forEach((el, id) => {
      const r = restaurantMap.get(id);
      if (!r) return;
      const inner = el.firstChild as HTMLElement | null;
      if (!inner) return;
      if (id === selected?.id) {
        inner.style.transform = "scale(1.25)";
        inner.style.boxShadow = `0 0 0 2.5px white, 0 0 0 5px ${r.color}`;
        inner.style.animation = "markerPulse 1.6s ease-in-out infinite";
      } else {
        inner.style.transform = "scale(1)";
        inner.style.boxShadow = `0 0 0 2px ${r.color}40`;
        inner.style.animation = "";
      }
    });
  }, [selected, restaurants]);

  // Show/hide existing markers when score filter changes
  useEffect(() => {
    restaurants.forEach((r) => {
      const el = markerEls.current.get(r.id);
      if (!el) return;
      el.style.display = meetsScoreFilter(r, scoreFilter) ? "" : "none";
    });
    if (selected && !meetsScoreFilter(selected, scoreFilter)) setSelected(null);
  }, [scoreFilter, restaurants, selected]);

  // Commit search: text search or clear back to viewport
  const commitSearch = useCallback(async (q: string) => {
    setCommittedSearch(q);
    setSelected(null);

    if (!q) {
      searchMode.current = false;
      fetchViewport();
      return;
    }

    searchMode.current = true;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/map-search?q=${encodeURIComponent(q)}`);
      const data: MapRestaurant[] = await res.json();
      setRestaurants(data);
    } finally {
      setIsSearching(false);
    }
  }, [fetchViewport]);

  // Fetch autocomplete suggestions as user types, filtered to current map viewport
  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        const b = map.current?.getBounds();
        if (b) {
          params.set("swLat", String(b.getSouthWest().lat));
          params.set("swLng", String(b.getSouthWest().lng));
          params.set("neLat", String(b.getNorthEast().lat));
          params.set("neLng", String(b.getNorthEast().lng));
        }
        const res = await fetch(`/api/suggestions?${params}`);
        const data = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 200);
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectSuggestion = useCallback(async (s: { id: number; name: string }) => {
    setSearch(s.name);
    setSuggestions([]);
    setShowSuggestions(false);
    setScoreFilter("all");        // ensure the restaurant is visible
    searchMode.current = false;   // stay in viewport mode after flyTo
    setCommittedSearch("");

    setIsSearching(true);
    try {
      const res = await fetch(`/api/map-search?q=${encodeURIComponent(s.name)}`);
      const results: MapRestaurant[] = await res.json();
      const restaurant = results.find((r) => r.id === s.id) ?? null;

      if (restaurant) {
        // Make sure this restaurant has a marker even before the viewport refreshes
        setRestaurants((prev) =>
          prev.some((r) => r.id === restaurant.id) ? prev : [restaurant, ...prev]
        );
        setSelected(restaurant);
        map.current?.flyTo({
          center: [restaurant.lng, restaurant.lat],
          zoom: 15,
          duration: 900,
        });
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  const visibleCount = restaurants.filter((r) => meetsScoreFilter(r, scoreFilter)).length;

  const locateUser = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 14,
          duration: 1200,
        });
      },
      () => alert("Could not get your location.")
    );
  };

  return (
    <div className="relative w-full h-screen pt-16">
      <style>{`
        @keyframes markerPulse {
          0%, 100% { transform: scale(1.25); }
          50%       { transform: scale(1.35); }
        }
      `}</style>

      {/* Map */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Left side panel */}
      <div
        className="absolute top-16 left-0 bottom-0 z-20 w-80 flex flex-col border-r overflow-hidden"
        style={{
          backgroundColor: "oklch(0.08 0 0)",
          borderColor: "oklch(0.18 0 0)",
          transform: selected ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease",
          pointerEvents: selected ? "auto" : "none",
        }}
      >
        {selected && (
          <>
            {/* Close bar */}
            <button
              onClick={() => setSelected(null)}
              className="flex items-center gap-2 w-full px-5 py-3 border-b shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors hover:text-white group"
              style={{ borderColor: "oklch(0.18 0 0)", color: "oklch(0.48 0 0)", backgroundColor: "oklch(0.07 0 0)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Close
            </button>

            <div
              className="p-6 border-b shrink-0"
              style={{ borderColor: "oklch(0.16 0 0)", borderLeft: `3px solid ${selected.color}` }}
            >
              <p
                className="font-[family-name:var(--font-display)] leading-tight mb-1"
                style={{ fontSize: "clamp(1.4rem, 3vw, 1.9rem)", color: "oklch(0.95 0 0)" }}
              >
                {selected.name}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.48_0_0)] mb-4">
                {[selected.neighborhood, selected.city].filter(Boolean).join(" · ")}
              </p>

              <div className="flex items-center gap-3">
                <span
                  className="font-[family-name:var(--font-display)] leading-none"
                  style={{ fontSize: "2.25rem", color: selected.color }}
                >
                  {selected.score ?? "—"}
                </span>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[oklch(0.45_0_0)]">GF Score</p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: selected.color }}>
                    {selected.scoreLabel}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {selected.website && (
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[oklch(0.45_0_0)] mb-0.5">Website</p>
                  <a
                    href={selected.website.startsWith("http") ? selected.website : `https://${selected.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[12px] leading-snug text-[oklch(0.55_0.18_250)] hover:text-[oklch(0.70_0.18_250)] underline underline-offset-2 break-all"
                  >
                    {selected.website.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                </div>
              )}
              {[
                selected.cuisine       && { label: "Cuisine", value: selected.cuisine },
                selected.google_rating && { label: "Rating",  value: `★ ${selected.google_rating}` },
                priceStr(selected.price_level) && { label: "Price",   value: priceStr(selected.price_level)! },
                selected.address       && { label: "Address", value: selected.address },
              ].filter(Boolean).map((row) => {
                const { label, value } = row as { label: string; value: string };
                return (
                  <div key={label}>
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[oklch(0.45_0_0)] mb-0.5">{label}</p>
                    <p className="font-mono text-[12px] text-[oklch(0.82_0_0)] leading-snug">{value}</p>
                  </div>
                );
              })}
            </div>

            <div className="p-5 shrink-0 border-t" style={{ borderColor: "oklch(0.16 0 0)" }}>
              <Link
                href={`/restaurant/${selected.id}`}
                className="block w-full text-center font-mono text-[11px] uppercase tracking-[0.15em] py-3 border transition-colors hover:bg-[#FF7444] hover:text-black hover:border-[#FF7444]"
                style={{ borderColor: "oklch(0.3 0 0)", color: "oklch(0.75 0 0)" }}
              >
                View Full Details →
              </Link>
            </div>
          </>
        )}
      </div>

      {/* Top-left controls — shift right when panel is open */}
      <div
        className="absolute top-20 z-10 flex flex-col gap-2 w-64 transition-[left] duration-[250ms] ease-[ease]"
        style={{ left: selected ? "336px" : "16px" }}
      >
        {/* Search box + autocomplete */}
        <div ref={searchBoxRef} className="relative">
          <div
            className="flex items-center border"
            style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: committedSearch ? "#FF744460" : "oklch(0.28 0 0)" }}
          >
            <div className="flex items-center gap-2 px-3 py-2 flex-1 min-w-0">
              {isSearching ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="oklch(0.5 0 0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="oklch(0.5 0 0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              )}
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); fetchSuggestions(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.max(i - 1, -1));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (activeIndex >= 0 && suggestions[activeIndex]) {
                      selectSuggestion(suggestions[activeIndex]);
                    } else {
                      setShowSuggestions(false);
                      commitSearch(search.trim());
                    }
                  } else if (e.key === "Escape") {
                    setShowSuggestions(false);
                    if (!committedSearch) { setSearch(""); commitSearch(""); }
                  }
                }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Search restaurants…"
                className="bg-transparent outline-none w-full font-mono text-[12px] placeholder:text-[oklch(0.38_0_0)] min-w-0"
                style={{ color: "oklch(0.88 0 0)" }}
              />
              {(search || committedSearch) && (
                <button
                  onClick={() => { setSearch(""); setSuggestions([]); setShowSuggestions(false); commitSearch(""); }}
                  className="text-[oklch(0.45_0_0)] hover:text-white transition-colors text-[11px] shrink-0"
                >✕</button>
              )}
            </div>
            <button
              onClick={() => { setShowSuggestions(false); commitSearch(search.trim()); }}
              className="font-mono text-[10px] uppercase tracking-[0.1em] px-3 py-2 border-l shrink-0 transition-colors hover:text-[#FF7444]"
              style={{ borderColor: "oklch(0.22 0 0)", color: "oklch(0.55 0 0)" }}
            >
              Go
            </button>
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && (
            <div
              className="absolute top-full left-0 right-0 z-50 border border-t-0 overflow-hidden"
              style={{ backgroundColor: "oklch(0.11 0 0)", borderColor: "oklch(0.28 0 0)" }}
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={() => selectSuggestion(s)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className="w-full text-left px-3 py-2.5 flex items-baseline justify-between gap-3 border-b transition-colors duration-100"
                  style={{
                    borderColor: "oklch(0.18 0 0)",
                    backgroundColor: i === activeIndex ? "oklch(0.16 0 0)" : "transparent",
                  }}
                >
                  <span className="font-mono text-[12px] text-white truncate">
                    {highlightMatch(s.name, search)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Score filter pills */}
        <div
          className="flex border divide-x"
          style={{ borderColor: "oklch(0.28 0 0)", backgroundColor: "oklch(0.1 0 0)" }}
        >
          {SCORE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setScoreFilter(f.value)}
              className="flex-1 font-mono text-[10px] uppercase tracking-[0.1em] py-2 transition-colors duration-150"
              style={{
                color: scoreFilter === f.value ? "#FF7444" : "oklch(0.62 0 0)",
                backgroundColor: scoreFilter === f.value ? "#FF744412" : "transparent",
                borderColor: "oklch(0.28 0 0)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Count */}
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.48_0_0)] pl-1">
          {committedSearch
            ? `${visibleCount} result${visibleCount !== 1 ? "s" : ""}`
            : `${visibleCount} in view`}
        </p>
      </div>

      {/* Locate me button */}
      <button
        onClick={locateUser}
        className="absolute bottom-24 right-4 z-10 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 border transition-colors duration-150 hover:border-[#FF7444] hover:text-[#FF7444]"
        style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.3 0 0)", color: "oklch(0.75 0 0)" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
          <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
          <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
        </svg>
        Near me
      </button>

      {/* Hover tooltip — floats above the hovered pin (shown for any marker except the pinned one) */}
      {hovered && hovered.r.id !== selected?.id && (
        <div
          className="absolute z-30 pointer-events-none border p-3 w-52"
          style={{
            left: hovered.x,
            top: hovered.y + 64, // 64px = nav height (pt-16)
            transform: "translate(-50%, calc(-100% - 18px))",
            backgroundColor: "oklch(0.1 0 0)",
            borderColor: "oklch(0.25 0 0)",
            borderLeft: `3px solid ${hovered.r.color}`,
          }}
        >
          <p className="font-[family-name:var(--font-display)] text-base text-white leading-tight mb-1.5">
            {hovered.r.name}
          </p>
          {(hovered.r.google_rating || hovered.r.cuisine) && (
            <p className="font-mono text-[11px] tracking-[0.08em] text-[oklch(0.72_0_0)] mb-2">
              {[
                hovered.r.google_rating ? `★ ${hovered.r.google_rating}` : null,
                hovered.r.cuisine,
              ].filter(Boolean).join("  ·  ")}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className="font-[family-name:var(--font-display)] text-xl leading-none" style={{ color: hovered.r.color }}>
              {hovered.r.score ?? "—"}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: hovered.r.color }}>
              {hovered.r.scoreLabel}
            </span>
          </div>
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
