"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import Link from "next/link";
import type { MapRestaurant } from "../types";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

// Map base style follows the app theme (DOM markers persist across setStyle).
const MAP_STYLE_DARK = "mapbox://styles/mapbox/dark-v11";
const MAP_STYLE_LIGHT = "mapbox://styles/mapbox/light-v11";
function isLightTheme() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("light");
}

function priceStr(level: number | null) {
  return level ? "$".repeat(level) : null;
}

type SharedRestaurant = MapRestaurant & { google_maps_url: string | null };

export function SharedMapView({ restaurants, isLoggedIn, ownerName = "" }: { restaurants: SharedRestaurant[]; isLoggedIn: boolean; ownerName?: string }) {
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
      style: isLightTheme() ? MAP_STYLE_LIGHT : MAP_STYLE_DARK,
      center: [-73.985, 40.758],
      zoom: 12,
    });
    if (window.innerWidth >= 768) {
      map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    }
    map.current.on("load", () => setMapReady(true));

    const htmlEl = document.documentElement;
    let lastLight = isLightTheme();
    const themeObserver = new MutationObserver(() => {
      const nowLight = htmlEl.classList.contains("light");
      if (nowLight !== lastLight) {
        lastLight = nowLight;
        map.current?.setStyle(nowLight ? MAP_STYLE_LIGHT : MAP_STYLE_DARK);
      }
    });
    themeObserver.observe(htmlEl, { attributes: true, attributeFilter: ["class"] });
    map.current.on("move", () => {
      // Keep hover tooltip position in sync while panning
      setHovered((prev) => {
        if (!prev || !map.current) return null;
        const pos = map.current.project([prev.r.lng, prev.r.lat]);
        return { ...prev, x: pos.x, y: pos.y };
      });
    });
    return () => { themeObserver.disconnect(); map.current?.remove(); map.current = null; };
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
        <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--border-emphasis)" }} />
      </div>

      {/* Close bar — desktop only */}
      <button
        onClick={() => setSelected(null)}
        className="hidden md:flex items-center gap-2 w-full px-5 py-3 border-b shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors hover:text-text-primary"
        style={{ borderColor: "var(--border-subtle)", color: "var(--text-label)", backgroundColor: "var(--surface-base)" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Close
      </button>

      <div
        className="p-5 md:p-6 border-b shrink-0"
        style={{ borderColor: "var(--surface-overlay)" }}
      >
        <div className="flex items-start justify-between gap-3 md:block">
          <div className="min-w-0">
            <p
              className="font-[family-name:var(--font-display)] leading-tight mb-1"
              style={{ fontSize: "clamp(1.4rem, 3vw, 1.9rem)", color: "var(--text-primary)" }}
            >
              {selected.name}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-label mb-4">
              {[selected.neighborhood, selected.city].filter(Boolean).join(" · ")}
            </p>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={() => setSelected(null)}
            className="md:hidden shrink-0 mt-1 p-1"
            style={{ color: "var(--text-label)" }}
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
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-disabled">GF Score</p>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: selected.color }}>
              {selected.scoreLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4">
        {selected.website && (
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-disabled mb-0.5">Website</p>
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
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-disabled mb-0.5">{label}</p>
              <p className="font-mono text-[12px] text-text-secondary leading-snug">{value}</p>
            </div>
          );
        })}
      </div>

      <div className="p-5 shrink-0 border-t space-y-3" style={{ borderColor: "var(--surface-overlay)" }}>
        <Link
          href={`/restaurant/${selected.slug ?? selected.id}`}
          className="block w-full text-center font-mono text-ui-md uppercase tracking-label py-3 border transition-colors"
          style={{ borderColor: "var(--border-emphasis)", color: "var(--text-tertiary)" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent-foreground)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.borderColor = "var(--border-emphasis)"; }}
        >
          View Full Details →
        </Link>
        {!isLoggedIn && (
          <Link
            href="/login"
            className="block w-full text-center font-mono text-[11px] uppercase tracking-[0.15em] py-3 transition-opacity hover:opacity-80"
            style={{ backgroundColor: "var(--text-primary)", color: "var(--surface-base)" }}
          >
            Sign up to save →
          </Link>
        )}
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 pt-16 z-0 flex flex-col">
      <style>{`
        @keyframes markerPulse {
          0%, 100% { transform: scale(1.25); }
          50%       { transform: scale(1.35); }
        }
      `}</style>

      {/* Top bar — spot count + create CTA */}
      <div
        className="shrink-0 flex items-center justify-between px-4 md:px-6 py-2.5 border-b"
        style={{ backgroundColor: "var(--surface-base)", borderColor: "var(--border-subtle)", zIndex: 10 }}
      >
        <span
          className="font-mono text-[10px] uppercase tracking-[0.2em]"
          style={{ color: "var(--text-dim)" }}
        >
          {ownerName
            ? `${ownerName}'s Gluten-Free Spots`
            : "Gluten-Free Spots"}
        </span>
        {!isLoggedIn && (
          <Link
            href="/login"
            className="font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 border transition-colors"
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          >
            Create yours →
          </Link>
        )}
      </div>

      {/* Map area — fills remaining space; min-h-0 lets flex child shrink so h-full works */}
      <div className="flex-1 min-h-0 relative">
        <div ref={mapContainer} className="w-full h-full" />

        {/* Empty state */}
        {count === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em]" style={{ color: "var(--text-disabled)" }}>
              No saved spots to show
            </p>
          </div>
        )}

        {/* Desktop side panel — positioned within map area so it never overlaps the nav */}
        <div
          className="hidden md:flex absolute top-0 left-0 bottom-0 z-20 w-80 flex-col border-r overflow-hidden"
          style={{
            backgroundColor: "var(--surface-base)",
            borderColor: "var(--border-subtle)",
            borderLeft: selected ? `4px solid ${selected.color}` : undefined,
            transform: selected ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.25s ease",
            pointerEvents: selected ? "auto" : "none",
          }}
        >
          {panelContent}
        </div>

        {/* Hover tooltip — desktop only */}
        {!isMobile && hovered && hovered.r.id !== selected?.id && (
          <div
            className="absolute z-30 pointer-events-none border p-3 w-52"
            style={{
              left: hovered.x,
              top: hovered.y,
              transform: "translate(-50%, calc(-100% - 18px))",
              backgroundColor: "var(--surface-raised)",
              borderColor: "var(--border-default)",
              borderLeft: `3px solid ${hovered.r.color}`,
            }}
          >
            <p className="font-[family-name:var(--font-display)] text-base text-text-primary leading-tight mb-1.5">
              {hovered.r.name}
            </p>
            {(hovered.r.google_rating || hovered.r.cuisine) && (
              <p className="font-mono text-[11px] tracking-[0.08em] text-text-tertiary mb-2">
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

      {/* Mobile backdrop */}
      {isMobile && selected && (
        <div className="fixed inset-0 z-20" onClick={() => setSelected(null)} />
      )}

      {/* Mobile bottom sheet */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex flex-col overflow-hidden rounded-t-2xl"
        style={{
          backgroundColor: "var(--surface-base)",
          height: "55vh",
          borderLeft: selected ? `4px solid ${selected.color}` : undefined,
          transform: selected ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s ease",
          pointerEvents: selected ? "auto" : "none",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.5)",
        }}
      >
        {panelContent}
      </div>

      {/* Bottom CTA — logged-out visitors only */}
      {!isLoggedIn && (
        <div
          className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t"
          style={{ backgroundColor: "var(--surface-base)", borderColor: "var(--border-subtle)", zIndex: 10 }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-center sm:text-left"
            style={{ color: "var(--text-disabled)" }}
          >
            Save your favorite gluten-free spots and share your own map.
          </p>
          <Link
            href="/login"
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] px-5 py-2.5"
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
          >
            Sign up free →
          </Link>
        </div>
      )}
    </div>
  );
}
