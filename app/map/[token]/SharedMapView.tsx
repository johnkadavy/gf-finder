"use client";

import { useRef, useEffect, useState } from "react";
import mapboxgl from "mapbox-gl";
import Link from "next/link";
import type { MapRestaurant } from "../types";
import { getScoreLabel } from "@/lib/score";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

function priceStr(level: number | null) {
  return level ? "$".repeat(level) : null;
}

type SharedRestaurant = MapRestaurant & { google_maps_url: string | null };

export function SharedMapView({ restaurants }: { restaurants: SharedRestaurant[] }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markerRefs = useRef<mapboxgl.Marker[]>([]);
  const selectedIdRef = useRef<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState<SharedRestaurant | null>(null);

  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
  }, [selected]);

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
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !map.current) return;

    markerRefs.current.forEach((m) => m.remove());
    markerRefs.current = [];

    if (restaurants.length === 0) return;

    // Fit map to all markers
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
      });
      el.addEventListener("mouseleave", () => {
        if (selectedIdRef.current !== r.id) {
          inner.style.transform = "scale(1)";
          inner.style.boxShadow = `0 0 0 2px ${r.color}40`;
        }
      });
      el.addEventListener("click", () => {
        setSelected((prev) => (prev?.id === r.id ? null : r));
      });

      // Pop-in animation
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
  }, [mapReady, restaurants]);

  // Highlight selected marker
  useEffect(() => {
    markerRefs.current.forEach((marker) => {
      const el = marker.getElement();
      const inner = el.firstChild as HTMLElement | null;
      if (!inner) return;
      const r = restaurants.find((r) => {
        const pos = marker.getLngLat();
        return pos.lng === r.lng && pos.lat === r.lat;
      });
      if (!r) return;
      if (r.id === selected?.id) {
        inner.style.transform = "scale(1.25)";
        inner.style.boxShadow = `0 0 0 2.5px white, 0 0 0 5px ${r.color}`;
      } else {
        inner.style.transform = "scale(1)";
        inner.style.boxShadow = `0 0 0 2px ${r.color}40`;
      }
    });
  }, [selected, restaurants]);

  const count = restaurants.length;

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: "#111" }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-4 md:px-6 py-3 border-b"
        style={{ borderColor: "oklch(0.18 0 0)", zIndex: 10, position: "relative" }}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.3em]"
            style={{ color: "#FF7444" }}
          >
            CleanPlate
          </Link>
          <span
            className="font-mono text-[10px] uppercase tracking-[0.2em]"
            style={{ color: "oklch(0.42 0 0)" }}
          >
            {count === 0 ? "No spots saved yet" : `${count} Gluten-Free Spot${count === 1 ? "" : "s"}`}
          </span>
        </div>
        <Link
          href="/login"
          className="font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 border transition-colors"
          style={{ borderColor: "#FF7444", color: "#FF7444" }}
        >
          Create yours →
        </Link>
      </div>

      {/* Map + panel */}
      <div className="flex-1 relative overflow-hidden">
        <div ref={mapContainer} className="absolute inset-0" />

        {/* Empty state */}
        {count === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p
              className="font-mono text-[11px] uppercase tracking-[0.25em]"
              style={{ color: "oklch(0.4 0 0)" }}
            >
              No saved spots to show
            </p>
          </div>
        )}

        {/* Selected panel */}
        {selected && (
          <div
            className="absolute top-3 left-3 w-72 md:w-80 pointer-events-auto"
            style={{ zIndex: 10 }}
          >
            <div
              className="border p-5 space-y-3"
              style={{
                backgroundColor: "oklch(0.10 0 0)",
                borderColor: "oklch(0.22 0 0)",
                borderLeft: `3px solid ${selected.color}`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/restaurant/${selected.id}`}
                    className="font-[family-name:var(--font-display)] leading-tight hover:text-[#FF7444] transition-colors block"
                    style={{
                      fontSize: "1.25rem",
                      color: "oklch(0.95 0 0)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {selected.name}
                  </Link>
                  {(selected.neighborhood || selected.city) && (
                    <p
                      className="font-mono text-[10px] uppercase tracking-[0.2em] mt-1 truncate"
                      style={{ color: "oklch(0.5 0 0)" }}
                    >
                      {[selected.neighborhood, selected.city].filter(Boolean).join(" / ")}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className="font-[family-name:var(--font-display)] leading-none tabular-nums"
                    style={{ fontSize: "1.75rem", color: selected.color }}
                  >
                    {selected.score !== null ? Math.round(selected.score) : "—"}
                  </span>
                  <p
                    className="font-mono text-[9px] uppercase tracking-[0.15em] mt-0.5"
                    style={{ color: `${selected.color}cc` }}
                  >
                    {getScoreLabel(selected.score).label}
                  </p>
                </div>
              </div>

              {(selected.cuisine || selected.price_level) && (
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.15em]"
                  style={{ color: "oklch(0.55 0 0)" }}
                >
                  {[selected.cuisine, priceStr(selected.price_level)].filter(Boolean).join("  ·  ")}
                </p>
              )}

              <div className="flex items-center gap-4 pt-1">
                <Link
                  href={`/restaurant/${selected.id}`}
                  className="font-mono text-[10px] uppercase tracking-[0.15em] transition-colors"
                  style={{ color: "#FF7444" }}
                >
                  View →
                </Link>
                {selected.website && (
                  <a
                    href={selected.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] uppercase tracking-[0.15em] transition-colors hover:text-[#FF7444]"
                    style={{ color: "oklch(0.55 0 0)" }}
                  >
                    Website ↗
                  </a>
                )}
                {selected.google_maps_url && (
                  <a
                    href={selected.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] uppercase tracking-[0.15em] transition-colors hover:text-[#FF7444]"
                    style={{ color: "oklch(0.55 0 0)" }}
                  >
                    Maps ↗
                  </a>
                )}
              </div>

              <button
                onClick={() => setSelected(null)}
                className="absolute top-3 right-3 font-mono text-[10px] transition-colors"
                style={{ color: "oklch(0.4 0 0)" }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div
        className="shrink-0 border-t px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3"
        style={{ borderColor: "oklch(0.18 0 0)", backgroundColor: "oklch(0.08 0 0)" }}
      >
        <p
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-center sm:text-left"
          style={{ color: "oklch(0.45 0 0)" }}
        >
          Save your favorite gluten-free spots and share your own map.
        </p>
        <Link
          href="/login"
          className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] px-5 py-2.5 transition-colors"
          style={{ backgroundColor: "#FF7444", color: "#111" }}
        >
          Sign up free →
        </Link>
      </div>
    </div>
  );
}
