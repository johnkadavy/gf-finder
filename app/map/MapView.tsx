"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import Link from "next/link";
import type { MapRestaurant } from "./page";

import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

export function MapView({ restaurants }: { restaurants: MapRestaurant[] }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [selected, setSelected] = useState<MapRestaurant | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  const handleMarkerClick = useCallback((r: MapRestaurant) => {
    setSelected(r);
  }, []);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-73.985, 40.758], // NYC default
      zoom: 12,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    map.current.on("load", () => {
      // Add markers
      restaurants.forEach((r) => {
        const el = document.createElement("div");
        el.className = "gf-marker";
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
          color: oklch(0.08 0 0);
          box-shadow: 0 0 0 2px ${r.color}40;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        `;
        el.textContent = r.score !== null ? String(r.score) : "?";

        el.addEventListener("mouseenter", () => {
          el.style.transform = "scale(1.3)";
          el.style.boxShadow = `0 0 0 4px ${r.color}60`;
          el.style.zIndex = "10";
        });
        el.addEventListener("mouseleave", () => {
          el.style.transform = "scale(1)";
          el.style.boxShadow = `0 0 0 2px ${r.color}40`;
          el.style.zIndex = "";
        });
        el.addEventListener("click", () => handleMarkerClick(r));

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([r.lng, r.lat])
          .addTo(map.current!);

        markersRef.current.push(marker);
      });
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, [restaurants, handleMarkerClick]);

  const locateUser = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setUserLocation(coords);
        map.current?.flyTo({ center: coords, zoom: 14, duration: 1200 });
      },
      () => alert("Could not get your location.")
    );
  };

  return (
    <div className="relative w-full h-screen pt-16">
      {/* Map */}
      <div ref={mapContainer} className="w-full h-full" />

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

      {/* Count badge */}
      <div
        className="absolute top-20 left-4 z-10 font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 border"
        style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.25 0 0)", color: "oklch(0.6 0 0)" }}
      >
        {restaurants.length} restaurants
      </div>
    </div>
  );
}
