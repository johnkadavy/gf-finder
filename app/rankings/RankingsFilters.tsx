"use client";

import Link from "next/link";
import { useState } from "react";
import { EXPERIENCE_OPTIONS, rankingsUrl, type Filters } from "./utils";

export function RankingsFilters({
  cities,
  neighborhoods,
  filters,
}: {
  cities: string[];
  neighborhoods: string[];
  filters: Filters;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const activePills = [
    filters.fryer   && { label: "Safe fryer",               clear: rankingsUrl(filters, { fryer: false,   page: 1 }) },
    filters.labeled && { label: "Menu clearly marked",       clear: rankingsUrl(filters, { labeled: false, page: 1 }) },
    filters.experience !== "all" && {
      label: filters.experience === "great" ? "Great or better" : "Good or better",
      clear: rankingsUrl(filters, { experience: "all", page: 1 }),
    },
  ].filter(Boolean) as { label: string; clear: string }[];

  const clearAll = rankingsUrl(filters, { fryer: false, labeled: false, experience: "all", page: 1 });
  const activeCount = activePills.length;

  return (
    <div>
      {/* ── Level 1: City tabs ── */}
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

      {/* ── Level 1: Neighborhood tabs ── */}
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

      {/* ── Level 2: Filter bar (desktop) ── */}
      <div
        className="hidden md:flex items-stretch mt-5 border"
        style={{ borderColor: "oklch(0.22 0 0)", backgroundColor: "oklch(0.1 0 0)" }}
      >
        {/* Safety group */}
        <div className="flex flex-col justify-between px-5 py-3 border-r gap-3" style={{ borderColor: "oklch(0.18 0 0)" }}>
          <span className="font-mono text-[7px] uppercase tracking-[0.3em] text-[oklch(0.35_0_0)]">
            Safety
          </span>
          <div className="flex flex-wrap gap-2">
            <SafetyToggle
              label="Safe fryer (no shared oil)"
              active={filters.fryer}
              href={rankingsUrl(filters, { fryer: !filters.fryer, page: 1 })}
            />
            <SafetyToggle
              label="Menu clearly marks gluten-free"
              active={filters.labeled}
              href={rankingsUrl(filters, { labeled: !filters.labeled, page: 1 })}
            />
          </div>
        </div>

        {/* Experience group */}
        <div className="flex flex-col justify-between px-5 py-3 gap-3">
          <span className="font-mono text-[7px] uppercase tracking-[0.3em] text-[oklch(0.35_0_0)]">
            Experience
          </span>
          <div className="flex gap-0">
            {EXPERIENCE_OPTIONS.map((opt) => (
              <ExperienceTab
                key={opt.value}
                label={opt.label}
                active={filters.experience === opt.value}
                href={rankingsUrl(filters, { experience: opt.value, page: 1 })}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Level 2: Filter button (mobile) ── */}
      <button
        onClick={() => setSheetOpen(true)}
        className="md:hidden flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] px-4 py-2.5 border mt-5 transition-colors duration-150"
        style={{
          borderColor: activeCount > 0 ? "#FF744460" : "oklch(0.22 0 0)",
          backgroundColor: activeCount > 0 ? "#FF744410" : "oklch(0.1 0 0)",
          color: activeCount > 0 ? "#FF7444" : "oklch(0.55 0 0)",
        }}
      >
        Filters
        {activeCount > 0 && (
          <span
            className="flex items-center justify-center w-4 h-4 text-[8px] font-mono"
            style={{ backgroundColor: "#FF7444", color: "oklch(0.08 0 0)" }}
          >
            {activeCount}
          </span>
        )}
        <span className="text-[8px]">▼</span>
      </button>

      {/* ── Active filter pills ── */}
      {activePills.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="font-mono text-[8px] uppercase tracking-[0.25em] text-[oklch(0.35_0_0)]">
            Active:
          </span>
          {activePills.map((pill) => (
            <Link
              key={pill.label}
              href={pill.clear}
              className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] px-2.5 py-1 border transition-colors duration-150 hover:opacity-80"
              style={{ borderColor: "#FF744460", backgroundColor: "#FF744415", color: "#FF7444" }}
            >
              {pill.label}
              <span className="text-[8px] opacity-60">✕</span>
            </Link>
          ))}
          <Link
            href={clearAll}
            className="font-mono text-[9px] uppercase tracking-[0.2em] transition-colors duration-150 hover:text-white"
            style={{ color: "oklch(0.38 0 0)" }}
          >
            Clear all
          </Link>
        </div>
      )}

      {/* ── Mobile bottom sheet ── */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
            onClick={() => setSheetOpen(false)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 border-t px-6 pt-6 pb-10"
            style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.28 0 0)" }}
          >
            <div className="w-8 h-px mx-auto mb-7" style={{ backgroundColor: "oklch(0.3 0 0)" }} />

            <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-[oklch(0.35_0_0)] mb-3">
              Safety
            </p>
            <div className="flex flex-col gap-2 mb-7">
              <SheetToggle
                label="Safe fryer (no shared oil)"
                active={filters.fryer}
                href={rankingsUrl(filters, { fryer: !filters.fryer, page: 1 })}
                onNavigate={() => setSheetOpen(false)}
              />
              <SheetToggle
                label="Menu clearly marks gluten-free"
                active={filters.labeled}
                href={rankingsUrl(filters, { labeled: !filters.labeled, page: 1 })}
                onNavigate={() => setSheetOpen(false)}
              />
            </div>

            <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-[oklch(0.35_0_0)] mb-3">
              Experience
            </p>
            <div className="flex gap-0 mb-8">
              {EXPERIENCE_OPTIONS.map((opt) => (
                <SheetExperienceTab
                  key={opt.value}
                  label={opt.label}
                  active={filters.experience === opt.value}
                  href={rankingsUrl(filters, { experience: opt.value, page: 1 })}
                  onNavigate={() => setSheetOpen(false)}
                />
              ))}
            </div>

            <button
              onClick={() => setSheetOpen(false)}
              className="w-full font-mono text-[11px] uppercase tracking-[0.2em] py-3 border transition-colors"
              style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.7 0 0)" }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LocationTab({ label, href, active, secondary = false }: {
  label: string; href: string; active: boolean; secondary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="font-mono uppercase tracking-[0.2em] border-r border-t border-b transition-colors duration-150"
      style={{
        fontSize: secondary ? "9px" : "10px",
        padding: secondary ? "0.4rem 0.75rem" : "0.625rem 1rem",
        borderColor: secondary ? "oklch(0.18 0 0)" : "oklch(0.22 0 0)",
        backgroundColor: active ? (secondary ? "oklch(0.13 0 0)" : "oklch(0.15 0 0)") : "transparent",
        color: active ? "oklch(0.9 0 0)" : secondary ? "oklch(0.38 0 0)" : "oklch(0.45 0 0)",
        borderLeft: active ? "2px solid #FF7444" : "2px solid transparent",
      }}
    >
      {label}
    </Link>
  );
}

function SafetyToggle({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] px-3 py-2 border transition-colors duration-150"
      style={{
        borderColor: active ? "#FF744460" : "oklch(0.26 0 0)",
        backgroundColor: active ? "#FF744420" : "transparent",
        color: active ? "#FF7444" : "oklch(0.5 0 0)",
      }}
    >
      <span
        className="w-3 h-3 border flex items-center justify-center shrink-0 transition-colors duration-150"
        style={{
          borderColor: active ? "#FF7444" : "oklch(0.32 0 0)",
          backgroundColor: active ? "#FF7444" : "transparent",
        }}
      >
        {active && <span className="text-[7px] leading-none" style={{ color: "oklch(0.08 0 0)", fontWeight: 700 }}>✓</span>}
      </span>
      {label}
    </Link>
  );
}

function ExperienceTab({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className="font-mono text-[9px] uppercase tracking-[0.15em] px-4 py-2 border-t border-b border-r transition-colors duration-150"
      style={{
        borderColor: "oklch(0.22 0 0)",
        borderLeft: "1px solid oklch(0.22 0 0)",
        marginLeft: "-1px",
        backgroundColor: active ? "oklch(0.18 0 0)" : "transparent",
        color: active ? "oklch(0.92 0 0)" : "oklch(0.4 0 0)",
      }}
    >
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
      className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.15em] px-4 py-3 border transition-colors duration-150"
      style={{
        borderColor: active ? "#FF744460" : "oklch(0.26 0 0)",
        backgroundColor: active ? "#FF744420" : "transparent",
        color: active ? "#FF7444" : "oklch(0.55 0 0)",
      }}
    >
      <span
        className="w-3.5 h-3.5 border flex items-center justify-center shrink-0"
        style={{
          borderColor: active ? "#FF7444" : "oklch(0.35 0 0)",
          backgroundColor: active ? "#FF7444" : "transparent",
        }}
      >
        {active && <span className="text-[8px] leading-none font-bold" style={{ color: "oklch(0.08 0 0)" }}>✓</span>}
      </span>
      {label}
    </Link>
  );
}

function SheetExperienceTab({ label, active, href, onNavigate }: {
  label: string; active: boolean; href: string; onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex-1 text-center font-mono text-[9px] uppercase tracking-[0.15em] py-2.5 border-t border-b border-r transition-colors duration-150"
      style={{
        borderColor: "oklch(0.26 0 0)",
        borderLeft: "1px solid oklch(0.26 0 0)",
        marginLeft: "-1px",
        backgroundColor: active ? "oklch(0.18 0 0)" : "transparent",
        color: active ? "oklch(0.92 0 0)" : "oklch(0.45 0 0)",
      }}
    >
      {label}
    </Link>
  );
}
