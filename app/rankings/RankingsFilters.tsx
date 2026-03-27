"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EXPERIENCE_OPTIONS, rankingsUrl, type Filters } from "./utils";

// ── Location filters (rendered in hero) ────────────────────────────────────

export function RankingsLocationFilters({
  cities,
  neighborhoods,
  filters,
}: {
  cities: string[];
  neighborhoods: string[];
  filters: Filters;
}) {
  return (
    <div>
      {/* City tabs */}
      <div className="flex flex-wrap gap-0">
        <LocationTab
          label="All Cities"
          href={rankingsUrl(filters, { city: "all", neighborhood: "all", page: 1 })}
          active={filters.city === "all"}
        />
        {cities.map((city) => (
          <LocationTab
            key={city}
            label={city}
            href={rankingsUrl(filters, { city, neighborhood: "all", page: 1 })}
            active={filters.city === city}
          />
        ))}
      </div>

      {/* Neighborhood tabs */}
      {filters.city !== "all" && neighborhoods.length > 0 && (
        <div className="flex flex-wrap gap-0 mt-2">
          <LocationTab
            label="All Neighborhoods"
            href={rankingsUrl(filters, { neighborhood: "all", page: 1 })}
            active={filters.neighborhood === "all"}
            secondary
          />
          {neighborhoods.map((n) => (
            <LocationTab
              key={n}
              label={n}
              href={rankingsUrl(filters, { neighborhood: n, page: 1 })}
              active={filters.neighborhood === n}
              secondary
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Secondary filters (rendered above results) ──────────────────────────────

export function RankingsSecondaryFilters({
  filters,
  cuisines,
}: {
  filters: Filters;
  cuisines: string[];
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expOpen, setExpOpen] = useState(false);
  const [cuisineOpen, setCuisineOpen] = useState(false);

  const currentExp = EXPERIENCE_OPTIONS.find((o) => o.value === filters.experience)!;

  const activePills = [
    filters.fryer   && { label: "GF Fryer",      clear: rankingsUrl(filters, { fryer: false,   page: 1 }) },
    filters.labeled && { label: "GF Menu Labels", clear: rankingsUrl(filters, { labeled: false, page: 1 }) },
    filters.cuisine !== "all" && {
      label: filters.cuisine,
      clear: rankingsUrl(filters, { cuisine: "all", page: 1 }),
    },
    filters.experience !== "all" && {
      label: currentExp.label,
      clear: rankingsUrl(filters, { experience: "all", page: 1 }),
    },
  ].filter(Boolean) as { label: string; clear: string }[];

  const clearAll = rankingsUrl(filters, { fryer: false, labeled: false, cuisine: "all", experience: "all", page: 1 });
  const activeCount = activePills.length;

  return (
    <div>
      {/* Desktop filter bar */}
      <div className="hidden md:flex items-center gap-1">
        <FilterToggle
          label="GF Fryer"
          active={filters.fryer}
          href={rankingsUrl(filters, { fryer: !filters.fryer, page: 1 })}
        />

        <FilterToggle
          label="GF Menu Labels"
          active={filters.labeled}
          href={rankingsUrl(filters, { labeled: !filters.labeled, page: 1 })}
        />

        {/* Cuisine dropdown */}
        <div className="relative">
          <button
            onClick={() => { setCuisineOpen((o) => !o); setExpOpen(false); }}
            className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-3 transition-colors duration-150"
            style={{
              color: filters.cuisine !== "all" ? "#FF7444" : "oklch(0.7 0 0)",
              backgroundColor: filters.cuisine !== "all" ? "#FF744415" : "transparent",
            }}
          >
            <span className="text-[10px] text-[oklch(0.6_0_0)] tracking-[0.2em]">Cuisine:</span>
            {filters.cuisine === "all" ? "All" : filters.cuisine}
            <span className="text-[9px] opacity-50">{cuisineOpen ? "▲" : "▼"}</span>
          </button>

          {cuisineOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCuisineOpen(false)} />
              <div
                className="absolute left-0 top-full z-20 min-w-[200px] max-h-[320px] overflow-y-auto border"
                style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.22 0 0)" }}
              >
                <button
                  onClick={() => {
                    router.push(rankingsUrl(filters, { cuisine: "all", page: 1 }));
                    setCuisineOpen(false);
                  }}
                  className="w-full text-left font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 border-b transition-colors duration-150 hover:bg-[oklch(0.15_0_0)]"
                  style={{
                    borderColor: "oklch(0.18 0 0)",
                    color: filters.cuisine === "all" ? "#FF7444" : "oklch(0.72 0 0)",
                    backgroundColor: filters.cuisine === "all" ? "#FF744410" : "transparent",
                  }}
                >
                  All Cuisines
                </button>
                {cuisines.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      router.push(rankingsUrl(filters, { cuisine: c, page: 1 }));
                      setCuisineOpen(false);
                    }}
                    className="w-full text-left font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 border-b transition-colors duration-150 hover:bg-[oklch(0.15_0_0)]"
                    style={{
                      borderColor: "oklch(0.18 0 0)",
                      color: filters.cuisine === c ? "#FF7444" : "oklch(0.72 0 0)",
                      backgroundColor: filters.cuisine === c ? "#FF744410" : "transparent",
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Experience dropdown */}
        <div className="relative">
          <button
            onClick={() => { setExpOpen((o) => !o); setCuisineOpen(false); }}
            className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-3 transition-colors duration-150"
            style={{
              color: filters.experience !== "all" ? "#FF7444" : "oklch(0.7 0 0)",
              backgroundColor: filters.experience !== "all" ? "#FF744415" : "transparent",
            }}
          >
            <span className="text-[10px] text-[oklch(0.6_0_0)] tracking-[0.2em]">Experience:</span>
            {currentExp.label}
            <span className="text-[9px] opacity-50">{expOpen ? "▲" : "▼"}</span>
          </button>

          {expOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setExpOpen(false)} />
              <div
                className="absolute left-0 top-full z-20 min-w-[180px] border"
                style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.22 0 0)" }}
              >
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      router.push(rankingsUrl(filters, { experience: opt.value, page: 1 }));
                      setExpOpen(false);
                    }}
                    className="w-full text-left font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 border-b transition-colors duration-150 hover:bg-[oklch(0.15_0_0)]"
                    style={{
                      borderColor: "oklch(0.18 0 0)",
                      color: filters.experience === opt.value ? "#FF7444" : "oklch(0.72 0 0)",
                      backgroundColor: filters.experience === opt.value ? "#FF744410" : "transparent",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Active pills inline */}
        {activePills.length > 0 && (
          <div className="flex items-center gap-2 ml-auto px-4">
            {activePills.map((pill) => (
              <Link
                key={pill.label}
                href={pill.clear}
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 border transition-colors duration-150 hover:opacity-80"
                style={{ borderColor: "#FF744460", backgroundColor: "#FF744415", color: "#FF7444" }}
              >
                {pill.label}
                <span className="text-[9px] opacity-60">✕</span>
              </Link>
            ))}
            <Link
              href={clearAll}
              className="font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-150 hover:text-white ml-1"
              style={{ color: "oklch(0.6 0 0)" }}
            >
              Clear all
            </Link>
          </div>
        )}
      </div>

      {/* Mobile filter button */}
      <button
        onClick={() => setSheetOpen(true)}
        className="md:hidden flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] px-0 py-2.5 border-b transition-colors duration-150 w-full"
        style={{
          borderColor: "oklch(0.2 0 0)",
          backgroundColor: "transparent",
          color: activeCount > 0 ? "#FF7444" : "oklch(0.7 0 0)",
        }}
      >
        Filters
        {activeCount > 0 && (
          <span
            className="flex items-center justify-center w-4 h-4 text-[9px] font-mono"
            style={{ backgroundColor: "#FF7444", color: "oklch(0.08 0 0)" }}
          >
            {activeCount}
          </span>
        )}
        <span className="text-[9px] ml-auto">▼</span>
      </button>

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
            onClick={() => setSheetOpen(false)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 border-t px-6 pt-6 pb-10 max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.28 0 0)" }}
          >
            <div className="w-8 h-px mx-auto mb-7" style={{ backgroundColor: "oklch(0.3 0 0)" }} />

            <div className="flex flex-col gap-2 mb-7">
              <SheetToggle
                label="GF Fryer"
                active={filters.fryer}
                href={rankingsUrl(filters, { fryer: !filters.fryer, page: 1 })}
                onNavigate={() => setSheetOpen(false)}
              />
              <SheetToggle
                label="GF Menu Labels"
                active={filters.labeled}
                href={rankingsUrl(filters, { labeled: !filters.labeled, page: 1 })}
                onNavigate={() => setSheetOpen(false)}
              />
            </div>

            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.6_0_0)] mb-3">
              Cuisine
            </p>
            <div className="flex flex-col gap-2 mb-7">
              <Link
                href={rankingsUrl(filters, { cuisine: "all", page: 1 })}
                onClick={() => setSheetOpen(false)}
                className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-3 border transition-colors duration-150"
                style={{
                  borderColor: filters.cuisine === "all" ? "#FF744460" : "oklch(0.26 0 0)",
                  backgroundColor: filters.cuisine === "all" ? "#FF744420" : "transparent",
                  color: filters.cuisine === "all" ? "#FF7444" : "oklch(0.72 0 0)",
                }}
              >
                All Cuisines
              </Link>
              {cuisines.map((c) => (
                <Link
                  key={c}
                  href={rankingsUrl(filters, { cuisine: c, page: 1 })}
                  onClick={() => setSheetOpen(false)}
                  className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-3 border transition-colors duration-150"
                  style={{
                    borderColor: filters.cuisine === c ? "#FF744460" : "oklch(0.26 0 0)",
                    backgroundColor: filters.cuisine === c ? "#FF744420" : "transparent",
                    color: filters.cuisine === c ? "#FF7444" : "oklch(0.72 0 0)",
                  }}
                >
                  {c}
                </Link>
              ))}
            </div>

            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.6_0_0)] mb-3">
              Experience
            </p>
            <div className="flex flex-col gap-2 mb-8">
              {EXPERIENCE_OPTIONS.map((opt) => (
                <Link
                  key={opt.value}
                  href={rankingsUrl(filters, { experience: opt.value, page: 1 })}
                  onClick={() => setSheetOpen(false)}
                  className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-3 border transition-colors duration-150"
                  style={{
                    borderColor: filters.experience === opt.value ? "#FF744460" : "oklch(0.26 0 0)",
                    backgroundColor: filters.experience === opt.value ? "#FF744420" : "transparent",
                    color: filters.experience === opt.value ? "#FF7444" : "oklch(0.72 0 0)",
                  }}
                >
                  {opt.label}
                </Link>
              ))}
            </div>

            <button
              onClick={() => setSheetOpen(false)}
              className="w-full font-mono text-[11px] uppercase tracking-[0.2em] py-3 border transition-colors"
              style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.75 0 0)" }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ───────────────────────────────────────────────────

function LocationTab({ label, href, active, secondary = false }: {
  label: string; href: string; active: boolean; secondary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="font-mono uppercase tracking-[0.2em] border-r border-t border-b transition-colors duration-150"
      style={{
        fontSize: secondary ? "10px" : "11px",
        padding: secondary ? "0.4rem 0.75rem" : "0.625rem 1rem",
        borderColor: secondary ? "oklch(0.18 0 0)" : "oklch(0.22 0 0)",
        backgroundColor: active ? (secondary ? "oklch(0.13 0 0)" : "oklch(0.15 0 0)") : "transparent",
        color: active ? "oklch(0.9 0 0)" : secondary ? "oklch(0.62 0 0)" : "oklch(0.68 0 0)",
        borderLeft: active ? "2px solid #FF7444" : "2px solid transparent",
      }}
    >
      {label}
    </Link>
  );
}

function FilterToggle({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-3 transition-colors duration-150"
      style={{
        backgroundColor: active ? "#FF744415" : "transparent",
        color: active ? "#FF7444" : "oklch(0.72 0 0)",
      }}
    >
      <span
        className="w-3.5 h-3.5 border flex items-center justify-center shrink-0 transition-colors duration-150"
        style={{
          borderColor: active ? "#FF7444" : "oklch(0.45 0 0)",
          backgroundColor: active ? "#FF7444" : "transparent",
        }}
      >
        {active && <span className="text-[8px] leading-none" style={{ color: "oklch(0.08 0 0)", fontWeight: 700 }}>✓</span>}
      </span>
      {label}
    </Link>
  );
}

function SheetToggle({ label, active, href, onNavigate }: {
  label: string; active: boolean; href: string; onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-3 border transition-colors duration-150"
      style={{
        borderColor: active ? "#FF744460" : "oklch(0.26 0 0)",
        backgroundColor: active ? "#FF744420" : "transparent",
        color: active ? "#FF7444" : "oklch(0.72 0 0)",
      }}
    >
      <span
        className="w-3.5 h-3.5 border flex items-center justify-center shrink-0"
        style={{
          borderColor: active ? "#FF7444" : "oklch(0.45 0 0)",
          backgroundColor: active ? "#FF7444" : "transparent",
        }}
      >
        {active && <span className="text-[8px] leading-none font-bold" style={{ color: "oklch(0.08 0 0)" }}>✓</span>}
      </span>
      {label}
    </Link>
  );
}
