"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import Link from "next/link";
import type { MapRestaurant } from "../types";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

function priceStr(level: number | null) {
  return level ? "$".repeat(level) : null;
}

type SharedRestaurant = MapRestaurant & { google_maps_url: string | null };

export function SharedMapView({ restaurants, isLoggedIn }: { restaurants: SharedRestaurant[]; isLoggedIn: boolean }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markerRefs = useRef<mapboxgl.Marker[]>([]);
  const selectedIdRef = useRef<number | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState<SharedRestaurant | null>(null);
  const [hovered, setHovered] = useState<{ r: SharedRestaurant; x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { selectedIdRef.current = selected?.id ?? null; }, [selected]);

  const handleMarkerHover = useCallback((r: SharedRestaurant) => {
    const pos = map.current?.project([r.lng, r.lat]);
    if (pos) setHovered({ r, x: pos.x, y: pos.y });
  }, []);
  const handleMarkerLeave = useCallback(() => setHovered(null), []);
  const handleMarkerClick = useCallback((r: SharedRestaurant) => {
    setSelected((prev) => (prev?.id === r.id ? null : r));
  }, []);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-73.985, 40.758],
      zoom: 12,
    });
    if (window.innerWidth >= 768) {
      map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    }
    map.current.on("load", () => setMapReady(true));
    map.current.on("move", () => {
      // Keep hover tooltip position in sync while panning
      setHovered((prev) => {
        if (!prev || !map.current) return null;
        const pos = map.current.project([prev.r.lng, prev.r.lat]);
        return { ...prev, x: pos.x, y: pos.y };
      });
    });
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!mapReady || !map.current) return;

    markerRefs.current.forEach((m) => m.remove());
    markerRefs.current = [];

    if (restaurants.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    restaurants.forEach((r) => bounds.extend([r.lng, r.lat]));
    map.current.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 0 });

    restaurants.forEach((r) => {
      const el = document.createElement("div");
      el.style.cssText = "width: 28px; height: 28px; cursor: pointer;";

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

      inner.style.opacity = "0";
      inner.style.transform = "scale(0.5)";

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([r.lng, r.lat])
        .addTo(map.current!);
      markerRefs.current.push(marker);

      requestAnimationFrame(() => {
        inner.style.transition = "transform 0.2s ease-out, opacity 0.15s ease-out";
        inner.style.transform = "";
        inner.style.opacity = "";
        setTimeout(() => {
          inner.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";
        }, 220);
      });
    });
  }, [mapReady, restaurants, handleMarkerHover, handleMarkerLeave, handleMarkerClick]);

  // Highlight selected marker
  useEffect(() => {
    markerRefs.current.forEach((marker) => {
      const el = marker.getElement();
      const inner = el.firstChild as HTMLElement | null;
      if (!inner) return;
      const pos = marker.getLngLat();
      const r = restaurants.find((r) => r.lng === pos.lng && r.lat === pos.lat);
      if (!r) return;
      if (r.id === selected?.id) {
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

  const count = restaurants.length;

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
          selected.cuisine             && { label: "Cuisine", value: selected.cuisine },
          selected.google_rating       && { label: "Rating",  value: `★ ${selected.google_rating}` },
          priceStr(selected.price_level) && { label: "Price",  value: priceStr(selected.price_level)! },
          selected.address             && { label: "Address", value: selected.address },
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

      <div className="p-5 shrink-0 border-t space-y-3" style={{ borderColor: "oklch(0.16 0 0)" }}>
        <Link
          href={`/restaurant/${selected.id}`}
          className="block w-full text-center font-mono text-[11px] uppercase tracking-[0.15em] py-3 border transition-colors hover:bg-[#FF7444] hover:text-black hover:border-[#FF7444]"
          style={{ borderColor: "oklch(0.3 0 0)", color: "oklch(0.75 0 0)" }}
        >
          View Full Details →
        </Link>
        {!isLoggedIn && (
          <Link
            href="/login"
            className="block w-full text-center font-mono text-[11px] uppercase tracking-[0.15em] py-3 bg-white text-black hover:bg-[oklch(0.85_0_0)] transition-colors"
          >
            Sign up to save →
          </Link>
        )}
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
      `}</style>

      {/* Map */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Empty state */}
      {count === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em]" style={{ color: "oklch(0.4 0 0)" }}>
            No saved spots to show
          </p>
        </div>
      )}

      {/* Desktop side panel */}
      <div
        className="hidden md:flex absolute top-11 left-0 bottom-0 z-20 w-80 flex-col border-r overflow-hidden"
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

      {/* Mobile backdrop */}
      {isMobile && selected && (
        <div className="fixed inset-0 z-20" onClick={() => setSelected(null)} />
      )}

      {/* Mobile bottom sheet */}
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

      {/* Top bar — spot count + create CTA */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 md:px-6 py-2.5 border-b"
        style={{ backgroundColor: "oklch(0.08 0 0)", borderColor: "oklch(0.18 0 0)", zIndex: 10 }}
      >
        <span
          className="font-mono text-[10px] uppercase tracking-[0.2em]"
          style={{ color: "oklch(0.45 0 0)" }}
        >
          {count === 0 ? "No spots saved" : `${count} Gluten-Free Spot${count === 1 ? "" : "s"}`}
        </span>
        <Link
          href="/login"
          className="font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 border transition-colors"
          style={{ borderColor: "#FF7444", color: "#FF7444" }}
        >
          Create yours →
        </Link>
      </div>

      {/* Hover tooltip — desktop only */}
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

      {/* Bottom CTA — logged-out visitors only */}
      {!isLoggedIn && (
        <div
          className="absolute bottom-0 left-0 right-0 flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t"
          style={{ backgroundColor: "oklch(0.08 0 0)", borderColor: "oklch(0.18 0 0)", zIndex: 10 }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-center sm:text-left"
            style={{ color: "oklch(0.45 0 0)" }}
          >
            Save your favorite gluten-free spots and share your own map.
          </p>
          <Link
            href="/login"
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] px-5 py-2.5"
            style={{ backgroundColor: "#FF7444", color: "#111" }}
          >
            Sign up free →
          </Link>
        </div>
      )}
    </div>
  );
}
