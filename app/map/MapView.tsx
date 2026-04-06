"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import Link from "next/link";
import type { MapRestaurant } from "./types";
import { isOpenNow } from "./types";
import { getGaugeColor, getScoreLabel } from "@/lib/score";

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
  const committedSearchRef = useRef("");
  const autoFetchOnMoveEnd = useRef(false);
  const searchAreaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const selectedRef = useRef<MapRestaurant | null>(null);
  const selectedIdRef = useRef<number | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [restaurants, setRestaurants] = useState<MapRestaurant[]>([]);
  const [selected, setSelected] = useState<MapRestaurant | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
    selectedIdRef.current = selected?.id ?? null;
  }, [selected]);
  const [hovered, setHovered] = useState<{ r: MapRestaurant; x: number; y: number } | null>(null);
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [openNow, setOpenNow] = useState(false);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  useEffect(() => { committedSearchRef.current = committedSearch; }, [committedSearch]);
  const [isSearching, setIsSearching] = useState(false);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Autocomplete
  type Suggestion = { id: number; name: string; city: string; neighborhood: string | null; lat: number; lng: number; cuisine: string | null; google_rating: number | null; price_level: number | null; address: string | null; website_url: string | null; score: number | null };
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
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

  // Re-run an active text/cuisine search scoped to the current viewport
  const fetchSearch = useCallback(async (q: string) => {
    if (!map.current) return;
    const bounds = map.current.getBounds();
    if (!bounds) return;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const params = new URLSearchParams({
      q,
      swLat: String(sw.lat), swLng: String(sw.lng),
      neLat: String(ne.lat), neLng: String(ne.lng),
    });
    setShowSearchArea(false);
    setIsSearching(true);
    try {
      const res = await fetch(`/api/map-search?${params}`);
      const data: MapRestaurant[] = await res.json();
      setRestaurants(data);
    } finally {
      setIsSearching(false);
    }
  }, []);

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
    setShowSearchArea(false);
    setIsSearching(true);
    try {
      const res = await fetch(`/api/map-search?${params}`);
      const data: MapRestaurant[] = await res.json();
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

    const saved = (() => {
      try { return JSON.parse(localStorage.getItem("mapPosition") ?? "null"); } catch { return null; }
    })();
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: saved ? [saved.lng, saved.lat] : [-73.985, 40.758],
      zoom: saved?.zoom ?? 12,
    });
    // Only add zoom controls on desktop — mobile uses pinch-to-zoom
    if (window.innerWidth >= 768) {
      map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    }
    map.current.on("load", () => setMapReady(true));

    map.current.on("movestart", () => {
      if (searchAreaTimer.current) { clearTimeout(searchAreaTimer.current); searchAreaTimer.current = null; }
      setShowSearchArea(false);
    });

    map.current.on("moveend", () => {
      const c = map.current!.getCenter();
      localStorage.setItem("mapPosition", JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.current!.getZoom() }));
      if (autoFetchOnMoveEnd.current) {
        autoFetchOnMoveEnd.current = false;
        fetchViewport();
      } else {
        searchAreaTimer.current = setTimeout(() => setShowSearchArea(true), 600);
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
      markers.current.clear();
      markerEls.current.clear();
    };
  }, [fetchViewport, fetchSearch]);

  // Initial viewport fetch once map is ready
  useEffect(() => {
    if (mapReady) fetchViewport();
  }, [mapReady, fetchViewport]);

  const isVisible = useCallback((r: MapRestaurant) => {
    if (!meetsScoreFilter(r, scoreFilter)) return false;
    if (openNow) {
      const open = isOpenNow(r.periods);
      if (open === false) return false; // hide confirmed-closed; show unknown (null)
    }
    return true;
  }, [scoreFilter, openNow]);

  // Sync markers whenever the restaurant list changes
  useEffect(() => {
    if (!mapReady || !map.current) return;

    const newIds = new Set(restaurants.map((r) => r.id));

    markers.current.forEach((marker, id) => {
      if (!newIds.has(id)) {
        marker.remove();
        markers.current.delete(id);
        markerEls.current.delete(id);
      }
    });

    restaurants.forEach((r) => {
      if (markers.current.has(r.id)) return;
      const el = createMarkerEl(r, isVisible(r));
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([r.lng, r.lat])
        .addTo(map.current!);
      markers.current.set(r.id, marker);
      markerEls.current.set(r.id, el);
    });
  }, [mapReady, restaurants, isVisible, createMarkerEl]);

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
      el.style.display = isVisible(r) ? "" : "none";
    });
    if (selected && !isVisible(selected)) setSelected(null);
  }, [isVisible, restaurants, selected]);

  // Commit search: text search or clear back to viewport
  const commitSearch = useCallback(async (q: string) => {
    setCommittedSearch(q);
    setSelected(null);
    setShowSearchArea(false);

    if (!q) {
      searchMode.current = false;
      fetchViewport();
      return;
    }

    searchMode.current = true;
    setIsSearching(true);
    try {
      const bounds = map.current?.getBounds();
      const boundsParams = bounds
        ? `&swLat=${bounds.getSouthWest().lat}&swLng=${bounds.getSouthWest().lng}` +
          `&neLat=${bounds.getNorthEast().lat}&neLng=${bounds.getNorthEast().lng}`
        : "";
      const [searchRes, geoRes] = await Promise.all([
        fetch(`/api/map-search?q=${encodeURIComponent(q)}${boundsParams}`),
        fetch(`/api/geocode?q=${encodeURIComponent(q)}&token=${encodeURIComponent(process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "")}`),
      ]);

      const restaurants: MapRestaurant[] = await searchRes.json();

      if (restaurants.length > 0) {
        setRestaurants(restaurants);
      } else {
        const geoData = await geoRes.json();
        const feature = geoData.features?.[0];
        if (feature && map.current) {
          const [lng, lat] = feature.center;
          const currentCenter = map.current.getCenter();

          const R = 6371;
          const dLat = ((lat - currentCenter.lat) * Math.PI) / 180;
          const dLng = ((lng - currentCenter.lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((currentCenter.lat * Math.PI) / 180) *
              Math.cos((lat * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

          const placeType = feature.place_type?.[0] ?? "";
          const zoom =
            placeType === "address" ? 16 :
            placeType === "neighborhood" ? 14 :
            placeType === "place" ? 12 : 13;

          if (distKm > 100) {
            map.current.jumpTo({ center: [lng, lat], zoom });
          } else {
            map.current.flyTo({ center: [lng, lat], zoom, duration: 900 });
          }

          searchMode.current = false;
          setCommittedSearch("");
        }
        setRestaurants([]);
      }
    } finally {
      setIsSearching(false);
    }
  }, [fetchViewport]);

  // Fetch autocomplete suggestions as user types, scoped to a 3x-expanded viewport
  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        const b = map.current?.getBounds();
        if (b) {
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          const cLat = (sw.lat + ne.lat) / 2;
          const cLng = (sw.lng + ne.lng) / 2;
          const dLat = (ne.lat - sw.lat) * 1.5;
          const dLng = (ne.lng - sw.lng) * 1.5;
          params.set("swLat", String(cLat - dLat));
          params.set("swLng", String(cLng - dLng));
          params.set("neLat", String(cLat + dLat));
          params.set("neLng", String(cLng + dLng));
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

  const selectSuggestion = useCallback((s: Suggestion) => {
    setSearch(s.name);
    setSuggestions([]);
    setShowSuggestions(false);
    setScoreFilter("all");
    searchMode.current = false;
    setCommittedSearch("");
    setShowSearchArea(false);

    const restaurant: MapRestaurant = {
      id: s.id, name: s.name, city: s.city, neighborhood: s.neighborhood,
      lat: s.lat, lng: s.lng, cuisine: s.cuisine, google_rating: s.google_rating,
      price_level: s.price_level, address: s.address, website: s.website_url,
      score: s.score, color: getGaugeColor(s.score), scoreLabel: getScoreLabel(s.score).label,
      periods: null,
    };

    setRestaurants((prev) =>
      prev.some((r) => r.id === restaurant.id) ? prev : [restaurant, ...prev]
    );
    setSelected(restaurant);
    map.current?.flyTo({ center: [restaurant.lng, restaurant.lat], zoom: 15, duration: 900 });
  }, []);

  const visibleCount = restaurants.filter(isVisible).length;

  const locateUser = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        autoFetchOnMoveEnd.current = true;
        map.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 14,
          duration: 1200,
        });
      },
      () => alert("Could not get your location.")
    );
  };

  // Panel content — shared between desktop left panel and mobile bottom sheet
  const panelContent = selected && (
    <>
      {/* Drag handle — mobile only */}
      <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "oklch(0.3 0 0)" }} />
      </div>

      {/* Close bar — desktop only */}
      <button
        onClick={() => setSelected(null)}
        className="hidden md:flex items-center gap-2 w-full px-5 py-3 border-b shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors hover:text-white"
        style={{ borderColor: "oklch(0.18 0 0)", color: "oklch(0.48 0 0)", backgroundColor: "oklch(0.07 0 0)" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Close
      </button>

      <div
        className="p-5 md:p-6 border-b shrink-0"
        style={{ borderColor: "oklch(0.16 0 0)", borderLeft: `3px solid ${selected.color}` }}
      >
        {/* Mobile: name + close button in a row */}
        <div className="flex items-start justify-between gap-3 md:block">
          <div className="min-w-0">
            <p
              className="font-[family-name:var(--font-display)] leading-tight mb-1"
              style={{ fontSize: "clamp(1.4rem, 3vw, 1.9rem)", color: "oklch(0.95 0 0)" }}
            >
              {selected.name}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.48_0_0)] mb-4">
              {[selected.neighborhood, selected.city].filter(Boolean).join(" · ")}
            </p>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={() => setSelected(null)}
            className="md:hidden shrink-0 mt-1 p-1"
            style={{ color: "oklch(0.48 0 0)" }}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

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

      <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4">
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
  );

  return (
    <div className="fixed inset-0 pt-16 z-0">
      <style>{`
        @keyframes markerPulse {
          0%, 100% { transform: scale(1.25); }
          50%       { transform: scale(1.35); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Map */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* ── Desktop: left side panel ── */}
      <div
        className="hidden md:flex absolute top-16 left-0 bottom-0 z-20 w-80 flex-col border-r overflow-hidden"
        style={{
          backgroundColor: "oklch(0.08 0 0)",
          borderColor: "oklch(0.18 0 0)",
          transform: selected ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease",
          pointerEvents: selected ? "auto" : "none",
        }}
      >
        {panelContent}
      </div>

      {/* ── Mobile: bottom sheet backdrop ── */}
      {isMobile && selected && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setSelected(null)}
        />
      )}

      {/* ── Mobile: bottom sheet ── */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex flex-col overflow-hidden rounded-t-2xl"
        style={{
          backgroundColor: "oklch(0.08 0 0)",
          height: "55vh",
          transform: selected ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s ease",
          pointerEvents: selected ? "auto" : "none",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.5)",
        }}
      >
        {panelContent}
      </div>

      {/* ── Controls (search + filters) ──
          Desktop: top-left, shifts right when panel open
          Mobile:  full-width, no shift */}
      <div
        className="absolute top-20 z-10 flex flex-col gap-2 transition-[left] duration-[250ms] ease-[ease]"
        style={isMobile
          ? { left: "16px", right: "16px" }
          : { left: selected ? "336px" : "16px", width: "320px" }
        }
      >
        {/* Search box + autocomplete */}
        <div ref={searchBoxRef} className="relative">
          <div
            className="flex items-center border"
            style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: committedSearch ? "#FF744460" : "oklch(0.28 0 0)" }}
          >
            <div className="flex items-center gap-2 px-3 py-3 flex-1 min-w-0">
              {isSearching ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.5 0 0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.5 0 0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
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
                className="bg-transparent outline-none w-full font-mono text-[13px] placeholder:text-[oklch(0.38_0_0)] min-w-0"
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
              className="font-mono text-[10px] uppercase tracking-[0.1em] px-3 py-3 border-l shrink-0 transition-colors hover:text-[#FF7444]"
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

        {/* Score filter pills + Open now — single row */}
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
          {/* Open now pill — appended to filter row */}
          <button
            onClick={() => setOpenNow((v) => !v)}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] px-3 py-2 transition-colors duration-150"
            style={{
              color: openNow ? "#FF7444" : "oklch(0.62 0 0)",
              backgroundColor: openNow ? "#FF744412" : "transparent",
              borderColor: "oklch(0.28 0 0)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: openNow ? "#4ADE80" : "oklch(0.4 0 0)" }}
            />
            Open
          </button>
        </div>

        {/* Result count */}
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.42_0_0)] pl-0.5">
          {committedSearch
            ? `${visibleCount} result${visibleCount !== 1 ? "s" : ""}`
            : `${visibleCount} in view`}
        </p>
      </div>

      {/* Search this area button — centered, below controls on mobile */}
      {showSearchArea && (
        <div className="absolute left-1/2 -translate-x-1/2 z-20 md:top-20 top-48" style={{ animation: "fadeIn 0.2s ease-out" }}>
          <button
            onClick={() => {
              const q = committedSearchRef.current;
              if (q) fetchSearch(q); else fetchViewport();
            }}
            className="font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 border transition-colors duration-150 hover:border-[#FF7444] hover:text-[#FF7444] shadow-lg"
            style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.3 0 0)", color: "oklch(0.85 0 0)" }}
          >
            Search this area
          </button>
        </div>
      )}

      {/* Near me FAB — compass icon, bottom-right */}
      <button
        onClick={locateUser}
        aria-label="Near me"
        className="absolute bottom-8 right-4 z-10 w-11 h-11 flex items-center justify-center border transition-colors duration-150 hover:border-[#FF7444] hover:text-[#FF7444] rounded-full"
        style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.3 0 0)", color: "oklch(0.75 0 0)", boxShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="3 11 22 2 13 21 11 13 3 11"/>
        </svg>
      </button>

      {/* Hover tooltip — desktop only (touch devices don't hover) */}
      {!isMobile && hovered && hovered.r.id !== selected?.id && (
        <div
          className="absolute z-30 pointer-events-none border p-3 w-52"
          style={{
            left: hovered.x,
            top: hovered.y + 64,
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
