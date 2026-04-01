"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import Link from "next/link";
import type { MapRestaurant } from "./page";

import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

type ScoreFilter = "excellent" | "great" | "all";

const SCORE_FILTERS: { value: ScoreFilter; label: string; min: number }[] = [
  { value: "excellent", label: "Excellent", min: 85 },
  { value: "great",    label: "Great+",    min: 75 },
  { value: "all",      label: "All",       min: 0  },
];

function matchesFilter(r: MapRestaurant, filter: ScoreFilter, search: string): boolean {
  const min = SCORE_FILTERS.find((f) => f.value === filter)!.min;
  if ((r.score ?? 0) < min) return false;
  if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
  return true;
}

export function MapView({ restaurants }: { restaurants: MapRestaurant[] }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markerEls = useRef<Map<number, HTMLElement>>(new Map());
  const [selected, setSelected] = useState<MapRestaurant | null>(null);
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("excellent");
  const [search, setSearch] = useState("");

  const handleMarkerClick = useCallback((r: MapRestaurant) => {
    setSelected(r);
  }, []);

  // Init map + create all markers once
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-73.985, 40.758],
      zoom: 12,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    map.current.on("load", () => {
      restaurants.forEach((r) => {
        const el = document.createElement("div");
        el.style.cssText = `
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background-color: ${r.color};
          border: 2px solid rgba(0,0,0,0.4);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: monospace;
          font-size: 9px;
          font-weight: 700;
          color: #111;
          box-shadow: 0 0 0 2px ${r.color}40;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        `;
        el.textContent = r.score !== null ? String(r.score) : "?";

        // Default: hide non-excellent markers
        if ((r.score ?? 0) < 85) el.style.display = "none";

        el.addEventListener("mouseenter", () => {
          el.style.transform = "scale(1.3)";
          el.style.boxShadow = `0 0 0 4px ${r.color}60`;
        });
        el.addEventListener("mouseleave", () => {
          el.style.transform = "scale(1)";
          el.style.boxShadow = `0 0 0 2px ${r.color}40`;
        });
        el.addEventListener("click", () => handleMarkerClick(r));

        new mapboxgl.Marker({ element: el })
          .setLngLat([r.lng, r.lat])
          .addTo(map.current!);

        markerEls.current.set(r.id, el);
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
      markerEls.current.clear();
    };
  }, [restaurants, handleMarkerClick]);

  // Show/hide markers when filter or search changes
  useEffect(() => {
    restaurants.forEach((r) => {
      const el = markerEls.current.get(r.id);
      if (!el) return;
      el.style.display = matchesFilter(r, scoreFilter, search) ? "flex" : "none";
    });
    // Clear selection if it no longer matches
    if (selected && !matchesFilter(selected, scoreFilter, search)) {
      setSelected(null);
    }
  }, [scoreFilter, search, restaurants, selected]);

  const visibleCount = restaurants.filter((r) => matchesFilter(r, scoreFilter, search)).length;

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

      {/* Top-left controls */}
      <div className="absolute top-20 left-4 z-10 flex flex-col gap-2 w-64">

        {/* Search box */}
        <div
          className="flex items-center gap-2 border px-3 py-2"
          style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.28 0 0)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="oklch(0.5 0 0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search restaurants…"
            className="bg-transparent outline-none w-full font-mono text-[12px] placeholder:text-[oklch(0.38_0_0)]"
            style={{ color: "oklch(0.88 0 0)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-[oklch(0.45_0_0)] hover:text-white transition-colors text-[11px]">✕</button>
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
          {visibleCount} restaurant{visibleCount !== 1 ? "s" : ""}
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

      {/* Selected restaurant card */}
      {selected && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[calc(100%-2rem)] max-w-sm border p-5 space-y-3"
          style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.25 0 0)", borderLeft: `3px solid ${selected.color}` }}
        >
          <button
            onClick={() => setSelected(null)}
            className="absolute top-3 right-4 font-mono text-[11px] text-[oklch(0.45_0_0)] hover:text-white transition-colors"
          >
            ✕
          </button>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[oklch(0.55_0_0)] mb-1">
              {[selected.neighborhood, selected.city].filter(Boolean).join(" · ")}
            </p>
            <p
              className="font-[family-name:var(--font-display)] leading-none"
              style={{ fontSize: "clamp(1.3rem, 4vw, 1.8rem)", color: "oklch(0.95 0 0)" }}
            >
              {selected.name}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="font-[family-name:var(--font-display)] text-3xl leading-none"
                style={{ color: selected.color }}
              >
                {selected.score ?? "—"}
              </span>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[oklch(0.5_0_0)]">GF Score</p>
                <p className="font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: selected.color }}>
                  {selected.scoreLabel}
                </p>
              </div>
            </div>

            <Link
              href={`/restaurant/${selected.id}`}
              className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2 border transition-colors hover:bg-[#FF7444] hover:text-black hover:border-[#FF7444]"
              style={{ borderColor: "oklch(0.3 0 0)", color: "oklch(0.75 0 0)" }}
            >
              View →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
