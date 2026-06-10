"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { deriveKitchenStatus } from "@/lib/kitchen-status";
import { lookupBorough } from "@/lib/borough-lookup";
import { getGaugeColor } from "@/lib/score";
import { KitchenTag } from "@/app/components/KitchenTag";
import { ConfidenceDots } from "@/app/components/ConfidenceDots";
import { RestaurantActions } from "@/app/components/RestaurantActions";
import type { ScoringDossier } from "@/lib/score";

export type TableRestaurant = {
  id: number;
  name: string;
  score: number;
  slug: string | null;
  neighborhood: string | null;
  cuisine: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  dedicated_gf_kitchen: string | null;
  dossier: ScoringDossier | null;
};

const BOROUGH_ORDER = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

export function IndexTable({ restaurants }: { restaurants: TableRestaurant[] }) {
  const [filterNeighborhood, setFilterNeighborhood] = useState<string>("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dropdownOpen]);

  const neighborhoodGroups = useMemo(() => {
    const hoods = [
      ...new Set(
        restaurants.map((r) => r.neighborhood).filter(Boolean) as string[]
      ),
    ];

    const byBorough: Record<string, string[]> = {};
    const noBorough: string[] = [];

    for (const hood of hoods) {
      const borough = lookupBorough(hood);
      if (borough) {
        if (!byBorough[borough]) byBorough[borough] = [];
        byBorough[borough].push(hood);
      } else {
        noBorough.push(hood);
      }
    }

    const groups = BOROUGH_ORDER.filter((b) => byBorough[b]).map((b) => ({
      borough: b,
      hoods: byBorough[b].sort(),
    }));

    for (const b of Object.keys(byBorough).sort()) {
      if (!BOROUGH_ORDER.includes(b)) groups.push({ borough: b, hoods: byBorough[b].sort() });
    }

    if (noBorough.length > 0) groups.push({ borough: "Other", hoods: noBorough.sort() });

    return groups;
  }, [restaurants]);

  const rows = useMemo(() => {
    const base =
      filterNeighborhood === "all"
        ? restaurants
        : restaurants.filter((r) => r.neighborhood === filterNeighborhood);

    return [...base].sort((a, b) =>
      sortDir === "desc" ? b.score - a.score : a.score - b.score
    );
  }, [restaurants, filterNeighborhood, sortDir]);

  return (
    <div>
      {/* Controls bar */}
      <div
        className="flex items-center py-3 border-b"
        style={{ borderColor: "var(--border-default)" }}
      >
        {neighborhoodGroups.length > 1 && (
          <div className="flex items-center gap-3.5 pl-5">
            <span className="font-mono text-ui-xs uppercase tracking-stamp" style={{ color: "var(--text-disabled)" }}>
              Neighborhood
            </span>
            <div className="relative" ref={dropdownRef}>
              {/* Trigger */}
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center justify-between gap-6 font-mono text-ui-xs uppercase tracking-label border px-3.5 py-2.5 cursor-pointer focus-visible:outline-none"
                style={{
                  minWidth: "240px",
                  color: dropdownOpen ? "var(--text-primary)" : "var(--text-dim)",
                  background: "var(--surface-raised)",
                  borderColor: dropdownOpen ? "var(--accent)" : "var(--border-default)",
                  transition: "border-color 120ms ease, color 120ms ease",
                }}
              >
                <span>
                  {filterNeighborhood === "all"
                    ? `All Neighborhoods · ${restaurants.length}`
                    : `${filterNeighborhood} · ${restaurants.filter((r) => r.neighborhood === filterNeighborhood).length}`}
                </span>
                <span
                  style={{
                    color: "var(--text-disabled)",
                    display: "inline-block",
                    transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 120ms ease",
                  }}
                >
                  ▾
                </span>
              </button>

              {/* Panel */}
              {dropdownOpen && (
                <div
                  className="absolute left-0 top-full z-50 border overflow-y-auto"
                  style={{
                    minWidth: "100%",
                    maxHeight: "320px",
                    background: "var(--surface-overlay)",
                    borderColor: "var(--border-default)",
                    marginTop: "2px",
                  }}
                >
                  {[
                    { value: "all", label: `All Neighborhoods · ${restaurants.length}` },
                    ...neighborhoodGroups.flatMap(({ hoods }) =>
                      hoods.map((h) => ({
                        value: h,
                        label: `${h} · ${restaurants.filter((r) => r.neighborhood === h).length}`,
                      }))
                    ),
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => { setFilterNeighborhood(value); setDropdownOpen(false); }}
                      className="w-full text-left font-mono text-ui-xs uppercase tracking-label px-3.5 py-2.5 cursor-pointer border-b"
                      style={{
                        color: filterNeighborhood === value ? "var(--accent)" : "var(--text-dim)",
                        background: "transparent",
                        borderColor: "var(--border-subtle)",
                        transition: "color 80ms ease, background-color 80ms ease",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th
                className="font-mono text-ui-xs uppercase tracking-stamp text-right py-3 pr-5 w-12"
                style={{ color: "var(--text-disabled)" }}
              >
                #
              </th>
              <th
                className="font-mono text-ui-xs uppercase tracking-stamp text-left py-3 pr-6"
                style={{ color: "var(--text-disabled)" }}
              >
                Name / Neighborhood
              </th>
              <th
                className="font-mono text-ui-xs uppercase tracking-stamp text-left py-3 pr-6 whitespace-nowrap"
                style={{ color: "var(--text-disabled)" }}
              >
                Kitchen
              </th>
              <th
                className="font-mono text-ui-xs uppercase tracking-stamp text-left py-3 pr-6 whitespace-nowrap"
                style={{ color: "var(--text-disabled)" }}
              >
                Data Confidence
              </th>
              <th className="py-3 pr-6 w-24" />
              <th className="font-mono text-ui-xs uppercase tracking-stamp text-right py-3">
                <button
                  onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                  className="font-mono text-ui-xs uppercase tracking-stamp flex items-center gap-1 ml-auto cursor-pointer hover:text-white focus-visible:text-white focus-visible:outline-none"
                  style={{ color: "var(--accent)", transition: "color 120ms ease" }}
                >
                  GF Safety {sortDir === "desc" ? "↓" : "↑"}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const kitchenStatus = deriveKitchenStatus(r.dedicated_gf_kitchen);
              const confidence = r.dossier?.data_quality?.confidence ?? null;
              const href = r.slug ? `/restaurant/${r.slug}` : `/restaurant/${r.id}`;

              return (
                <tr
                  key={r.id}
                  className="border-b hover:bg-surface-overlay"
                  style={{ borderColor: "var(--border-subtle)", transition: "background-color 120ms ease" }}
                >
                  <td
                    className="font-[family-name:var(--font-display)] tabular-nums text-right pr-5 py-4 leading-none align-middle"
                    style={{ fontSize: "clamp(0.875rem, 1.2vw, 1.1rem)", color: "var(--text-disabled)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </td>

                  <td className="py-4 pr-6 align-middle">
                    <Link
                      href={href}
                      className="font-[family-name:var(--font-display)] leading-tight transition-colors hover:text-white"
                      style={{ fontSize: "clamp(0.9rem, 1.3vw, 1.2rem)", color: "var(--text-primary)", letterSpacing: "0.02em" }}
                    >
                      {r.name}
                    </Link>
                    {r.neighborhood && (() => {
                      const borough = lookupBorough(r.neighborhood);
                      const suffix = borough && borough !== "Manhattan" ? `, ${borough}` : "";
                      return (
                        <p className="font-mono text-ui-xs uppercase tracking-broad mt-0.5" style={{ color: "var(--text-dim)" }}>
                          {r.neighborhood}{suffix}
                        </p>
                      );
                    })()}
                  </td>

                  <td className="py-4 pr-6 align-middle whitespace-nowrap">
                    <KitchenTag status={kitchenStatus} />
                  </td>

                  <td className="py-4 pr-6 align-middle whitespace-nowrap">
                    <ConfidenceDots confidence={confidence} />
                  </td>

                  <td className="py-4 pr-6 align-middle">
                    <RestaurantActions
                      googleMapsUrl={r.google_maps_url}
                      websiteUrl={r.website_url}
                    />
                  </td>

                  <td className="py-4 align-middle text-right">
                    {/* Score number + bar side-by-side per mock. Tier label ("Excellent" etc.)
                        deliberately omitted — number + bar carry the signal. */}
                    <div className="flex items-center justify-end gap-2.5">
                      <span
                        className="font-[family-name:var(--font-display)] leading-none tabular-nums"
                        style={{ fontSize: "clamp(1.25rem, 2vw, 1.875rem)", color: getGaugeColor(r.score) }}
                      >
                        {r.score !== null ? Math.round(r.score) : "—"}
                      </span>
                      {r.score !== null && (
                        <div
                          className="w-10 shrink-0 relative"
                          style={{ height: "3px", backgroundColor: "var(--border-subtle)" }}
                        >
                          <div
                            className="absolute inset-y-0 left-0"
                            style={{ width: `${r.score}%`, backgroundColor: getGaugeColor(r.score) }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card fallback */}
      <div className="md:hidden space-y-0">
        {rows.map((r) => {
          const href = r.slug ? `/restaurant/${r.slug}` : `/restaurant/${r.id}`;
          return (
            <Link
              key={r.id}
              href={href}
              className="flex items-start justify-between border-b gap-4 py-4 px-2 transition-colors hover:bg-surface-raised"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="min-w-0">
                <span
                  className="font-[family-name:var(--font-display)] leading-tight"
                  style={{ fontSize: "clamp(1rem, 4vw, 1.25rem)", color: "var(--text-primary)", letterSpacing: "0.02em" }}
                >
                  {r.name}
                </span>
                {r.neighborhood && (
                  <p className="font-mono text-ui-xs uppercase tracking-broad mt-0.5" style={{ color: "var(--text-dim)" }}>
                    {r.neighborhood}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="font-[family-name:var(--font-display)] leading-none tabular-nums"
                  style={{ fontSize: "clamp(1.25rem, 5vw, 1.5rem)", color: getGaugeColor(r.score) }}
                >
                  {r.score !== null ? Math.round(r.score) : "—"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
