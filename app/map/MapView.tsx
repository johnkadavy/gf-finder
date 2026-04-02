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
  const searchMode = useRef(false);       // true while user has an active search
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [restaurants, setRestaurants] = useState<MapRestaurant[]>([]);
  const [selected, setSelected] = useState<MapRestaurant | null>(null);
  const [hovered, setHovered] = useState<MapRestaurant | null>(null);
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const handleMarkerHover = useCallback((r: MapRestaurant) => setHovered(r), []);
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
      inner.style.transform = "scale(1.3)";
      inner.style.boxShadow = `0 0 0 4px ${r.color}60`;
      handleMarkerHover(r);
    });
    el.addEventListener("mouseleave", () => {
      inner.style.transform = "scale(1)";
      inner.style.boxShadow = `0 0 0 2px ${r.color}40`;
      handleMarkerLeave();
    });
    el.addEventListener("click", () => handleMarkerClick(r));

    return el;
  }, [handleMarkerHover, handleMarkerLeave, handleMarkerClick]);

  // Fetch top restaurants for the current map viewport
  const fetchViewport = useCallback(async () => {
    if (!map.current) return;
    const bounds = map.current.getBounds();
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
            <div
              className="p-6 border-b shrink-0"
              style={{ borderColor: "oklch(0.16 0 0)", borderLeft: `3px solid ${selected.color}` }}
            >
              <button
                onClick={() => setSelected(null)}
                className="absolute top-[4.75rem] right-4 font-mono text-[11px] text-[oklch(0.4_0_0)] hover:text-white transition-colors"
              >
                ✕
              </button>

              <div className="flex items-center gap-3 mb-4">
                <span
                  className="font-[family-name:var(--font-display)] leading-none"
                  style={{ fontSize: "3rem", color: selected.color }}
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

              <p
                className="font-[family-name:var(--font-display)] leading-tight mb-1"
                style={{ fontSize: "clamp(1.2rem, 3vw, 1.6rem)", color: "oklch(0.95 0 0)" }}
              >
                {selected.name}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.48_0_0)]">
                {[selected.neighborhood, selected.city].filter(Boolean).join(" · ")}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
        {/* Search box */}
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
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSearch(search.trim());
                if (e.key === "Escape") { setSearch(""); commitSearch(""); }
              }}
              placeholder="Search restaurants…"
              className="bg-transparent outline-none w-full font-mono text-[12px] placeholder:text-[oklch(0.38_0_0)] min-w-0"
              style={{ color: "oklch(0.88 0 0)" }}
            />
            {(search || committedSearch) && (
              <button
                onClick={() => { setSearch(""); commitSearch(""); }}
                className="text-[oklch(0.45_0_0)] hover:text-white transition-colors text-[11px] shrink-0"
              >✕</button>
            )}
          </div>
          <button
            onClick={() => commitSearch(search.trim())}
            className="font-mono text-[10px] uppercase tracking-[0.1em] px-3 py-2 border-l shrink-0 transition-colors hover:text-[#FF7444]"
            style={{ borderColor: "oklch(0.22 0 0)", color: "oklch(0.55 0 0)" }}
          >
            Go
          </button>
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

      {/* Hover preview card — only shown when no panel is open */}
      {hovered && !selected && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[calc(100%-2rem)] max-w-sm border p-4 pointer-events-none"
          style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.25 0 0)", borderLeft: `3px solid ${hovered.color}` }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[oklch(0.5_0_0)] mb-1">
            {[hovered.neighborhood, hovered.city].filter(Boolean).join(" · ")}
          </p>
          <div className="flex items-center justify-between gap-3">
            <p className="font-[family-name:var(--font-display)] text-lg text-white leading-tight truncate">
              {hovered.name}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-[family-name:var(--font-display)] text-2xl leading-none" style={{ color: hovered.color }}>
                {hovered.score ?? "—"}
              </span>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: hovered.color }}>
                {hovered.scoreLabel}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
