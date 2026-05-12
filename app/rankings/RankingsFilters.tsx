"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EXPERIENCE_OPTIONS, GF_CATEGORY_OPTIONS, PLACE_TYPE_OPTIONS, rankingsUrl, type Filters } from "./utils";

// ── Reusable typeahead dropdown ─────────────────────────────────────────────

function LocationDropdown({
  label,
  value,
  options,
  allLabel,
  searchPlaceholder,
  isActive,
  onSelect,
  onClear,
}: {
  label?: string;
  value: string;
  options: string[];
  allLabel: string;
  searchPlaceholder: string;
  isActive: boolean;
  onSelect: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);

  const filtered = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative">
      {label && (
        <p className="font-mono text-ui-xs uppercase tracking-editorial mb-1" style={{ color: "oklch(0.5 0 0)" }}>
          {label}
        </p>
      )}
      <div
        className="flex items-center border"
        style={{
          borderColor: isActive ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
          backgroundColor: isActive ? "var(--accent-tint-xs)" : "var(--surface-raised)",
        }}
      >
        <button
          onClick={() => { setOpen((o) => !o); if (!open) setSearch(""); }}
          className="font-mono text-ui-md uppercase tracking-label px-4 py-2.5 transition-colors"
          style={{ color: isActive ? "var(--accent)" : "var(--text-tertiary)" }}
        >
          {value === "all" ? allLabel : value}
          <span className="ml-2 text-ui-xs opacity-40">{open ? "▲" : "▼"}</span>
        </button>
        <button
          onClick={onClear}
          className={`pr-3 pl-1 py-2.5 transition-colors hover:opacity-100 ${!isActive ? "invisible" : ""}`}
          style={{ color: "var(--text-label)" }}
        >
          ✕
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-20 min-w-[200px] border"
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--border-default)" }}
          >
            <div className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
              <input
                autoFocus
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent font-mono text-ui-md px-4 py-2.5 outline-none placeholder:opacity-40"
                style={{ color: "var(--text-secondary)" }}
              />
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {!search && (
                <button
                  onClick={() => { onSelect("all"); setOpen(false); }}
                  onMouseEnter={() => setHovered("all")}
                  onMouseLeave={() => setHovered(null)}
                  className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: value === "all" || hovered === "all" ? "var(--accent)" : "var(--text-tertiary)",
                    backgroundColor: value === "all" ? "var(--accent-tint-xs)" : hovered === "all" ? "var(--accent-tint-xs)" : "transparent",
                  }}
                >
                  {allLabel}
                </button>
              )}
              {filtered.map((opt) => (
                <button
                  key={opt}
                  onClick={() => { onSelect(opt); setOpen(false); setSearch(""); }}
                  onMouseEnter={() => setHovered(opt)}
                  onMouseLeave={() => setHovered(null)}
                  className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: value === opt || hovered === opt ? "var(--accent)" : "var(--text-tertiary)",
                    backgroundColor: value === opt ? "var(--accent-tint-xs)" : hovered === opt ? "var(--accent-tint-xs)" : "transparent",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Location filters (rendered in hero) ────────────────────────────────────

export function RankingsLocationFilters({
  regions,
  towns,
  neighborhoods,
  filters,
}: {
  regions: string[];
  towns: string[];        // second-level for multi-city regions (Long Island)
  neighborhoods: string[]; // second-level for single-city regions (NYC)
  filters: Filters;
}) {
  const router = useRouter();

  if (regions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 items-end">
      {/* Region selector */}
      <LocationDropdown
        value={filters.region}
        options={regions}
        allLabel="All Regions"
        searchPlaceholder="Search regions…"
        isActive={filters.region !== "all"}
        onSelect={(region) =>
          router.push(rankingsUrl(filters, { region, city: "all", neighborhood: "all", limit: 25 }), { scroll: false })
        }
        onClear={() =>
          router.push(rankingsUrl(filters, { region: "all", city: "all", neighborhood: "all", limit: 25 }), { scroll: false })
        }
      />

      {/* Town selector — multi-city regions (e.g. Long Island) */}
      {filters.region !== "all" && towns.length > 0 && (
        <LocationDropdown
          value={filters.city}
          options={towns}
          allLabel="All Towns"
          searchPlaceholder="Search towns…"
          isActive={filters.city !== "all"}
          onSelect={(city) =>
            router.push(rankingsUrl(filters, { city, neighborhood: "all", limit: 25 }), { scroll: false })
          }
          onClear={() =>
            router.push(rankingsUrl(filters, { city: "all", neighborhood: "all", limit: 25 }), { scroll: false })
          }
        />
      )}

      {/* Neighborhood selector — single-city regions (e.g. NYC) */}
      {filters.region !== "all" && neighborhoods.length > 0 && towns.length === 0 && (
        <LocationDropdown
          value={filters.neighborhood}
          options={neighborhoods}
          allLabel="All Neighborhoods"
          searchPlaceholder="Search neighborhoods…"
          isActive={filters.neighborhood !== "all"}
          onSelect={(neighborhood) =>
            router.push(rankingsUrl(filters, { neighborhood, limit: 25 }), { scroll: false })
          }
          onClear={() =>
            router.push(rankingsUrl(filters, { neighborhood: "all", limit: 25 }), { scroll: false })
          }
        />
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
  const [placeTypeOpen, setPlaceTypeOpen] = useState(false);
  const [gfCategoryOpen, setGfCategoryOpen] = useState(false);
  const [cuisineSearch, setCuisineSearch] = useState("");
  const [hoveredCuisine, setHoveredCuisine] = useState<string | null>(null);
  const [hoveredExp, setHoveredExp] = useState<string | null>(null);
  const [hoveredPlaceType, setHoveredPlaceType] = useState<string | null>(null);
  const [hoveredGfCategory, setHoveredGfCategory] = useState<string | null>(null);

  const currentExp = EXPERIENCE_OPTIONS.find((o) => o.value === filters.experience)!;

  const currentPlaceType  = PLACE_TYPE_OPTIONS.find((o) => o.value === filters.placeType);
  const currentGfCategory = GF_CATEGORY_OPTIONS.find((o) => o.value === filters.gfCategory);

  const activePills = [
    filters.fryer   && { label: "GF Fryer",      clear: rankingsUrl(filters, { fryer: false,   limit: 25 }) },
    filters.labeled && { label: "GF Menu Labels", clear: rankingsUrl(filters, { labeled: false, limit: 25 }) },
    filters.cuisine !== "all" && {
      label: filters.cuisine,
      clear: rankingsUrl(filters, { cuisine: "all", limit: 25 }),
    },
    filters.placeType !== "all" && {
      label: currentPlaceType?.label ?? filters.placeType,
      clear: rankingsUrl(filters, { placeType: "all", limit: 25 }),
    },
    filters.gfCategory !== "all" && {
      label: currentGfCategory?.label ?? filters.gfCategory,
      clear: rankingsUrl(filters, { gfCategory: "all", limit: 25 }),
    },
    filters.experience !== "all" && {
      label: currentExp.label,
      clear: rankingsUrl(filters, { experience: "all", limit: 25 }),
    },
    filters.priceLevel > 0 && {
      label: `Up to ${"$".repeat(filters.priceLevel)}`,
      clear: rankingsUrl(filters, { priceLevel: 0, limit: 25 }),
    },
  ].filter(Boolean) as { label: string; clear: string }[];

  const clearAll = rankingsUrl(filters, { fryer: false, labeled: false, cuisine: "all", placeType: "all", gfCategory: "all", priceLevel: 0, experience: "all", limit: 25 });
  const activeCount = activePills.length;

  return (
    <div>
      {/* Desktop filter bar */}
      <div className="hidden md:flex items-center flex-wrap gap-x-0 gap-y-0 border-b" style={{ borderColor: "var(--border-subtle)" }}>

        {/* Boolean toggles */}
        <FilterToggle
          label="GF Fryer"
          active={filters.fryer}
          href={rankingsUrl(filters, { fryer: !filters.fryer, limit: 25 })}
        />

        <FilterToggle
          label="GF Menu Labels"
          active={filters.labeled}
          href={rankingsUrl(filters, { labeled: !filters.labeled, limit: 25 })}
        />

        <div className="w-px self-stretch mx-1" style={{ backgroundColor: "var(--border-default)" }} />

        {/* Price filter */}
        <div className="flex items-center">
          <span className="font-mono text-ui-sm uppercase tracking-editorial px-3 py-3" style={{ color: "var(--text-dim)" }}>Price:</span>
          {[1, 2, 3, 4].map((level) => {
            const isMax = filters.priceLevel === level;
            const isActive = filters.priceLevel >= level && filters.priceLevel > 0;
            return (
              <Link
                key={level}
                href={rankingsUrl(filters, { priceLevel: isMax ? 0 : level, limit: 25 })}
                scroll={false}
                className="font-mono text-[12px] px-2 py-3 transition-colors duration-150"
                style={{
                  color: isActive ? "var(--accent)" : "var(--text-disabled)",
                  backgroundColor: isMax ? "var(--accent-tint-sm)" : "transparent",
                  fontWeight: isMax ? 600 : 400,
                }}
              >
                {"$".repeat(level)}
              </Link>
            );
          })}
        </div>

        <div className="w-px self-stretch mx-1" style={{ backgroundColor: "var(--border-default)" }} />

        {/* GF Food dropdown */}
        <div className="relative">
          <button
            onClick={() => { setGfCategoryOpen((o) => !o); setCuisineOpen(false); setPlaceTypeOpen(false); setExpOpen(false); }}
            className="flex items-center gap-2 font-mono text-ui-md uppercase tracking-label px-4 py-3 transition-colors duration-150"
            style={{
              color: filters.gfCategory !== "all" ? "var(--accent)" : "var(--text-tertiary)",
              backgroundColor: filters.gfCategory !== "all" ? "var(--accent-tint-sm)" : "transparent",
            }}
          >
            <span className="text-ui-sm text-text-dim tracking-editorial">GF Food:</span>
            {filters.gfCategory === "all" ? "All" : (currentGfCategory?.label ?? filters.gfCategory)}
            <span className="text-ui-xs opacity-50">{gfCategoryOpen ? "▲" : "▼"}</span>
          </button>

          {gfCategoryOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setGfCategoryOpen(false)} />
              <div
                className="absolute left-0 top-full z-20 min-w-[180px] border"
                style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--border-default)" }}
              >
                {[{ label: "All Categories", value: "all" }, ...GF_CATEGORY_OPTIONS].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { router.push(rankingsUrl(filters, { gfCategory: opt.value, limit: 25 }), { scroll: false }); setGfCategoryOpen(false); }}
                    onMouseEnter={() => setHoveredGfCategory(opt.value)}
                    onMouseLeave={() => setHoveredGfCategory(null)}
                    className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors duration-150"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: filters.gfCategory === opt.value || hoveredGfCategory === opt.value ? "var(--accent)" : "var(--text-tertiary)",
                      backgroundColor: filters.gfCategory === opt.value ? "var(--accent-tint-xs)" : hoveredGfCategory === opt.value ? "var(--accent-tint-xs)" : "transparent",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Cuisine dropdown */}
        <div className="relative">
          <button
            onClick={() => { setCuisineOpen((o) => !o); setExpOpen(false); setGfCategoryOpen(false); setPlaceTypeOpen(false); if (!cuisineOpen) setCuisineSearch(""); }}
            className="flex items-center gap-2 font-mono text-ui-md uppercase tracking-label px-4 py-3 transition-colors duration-150"
            style={{
              color: filters.cuisine !== "all" ? "var(--accent)" : "var(--text-tertiary)",
              backgroundColor: filters.cuisine !== "all" ? "var(--accent-tint-sm)" : "transparent",
            }}
          >
            <span className="text-ui-sm text-text-dim tracking-editorial">Cuisine:</span>
            {filters.cuisine === "all" ? "All" : filters.cuisine}
            <span className="text-ui-xs opacity-50">{cuisineOpen ? "▲" : "▼"}</span>
          </button>

          {cuisineOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCuisineOpen(false)} />
              <div
                className="absolute left-0 top-full z-20 min-w-[220px] border"
                style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--border-default)" }}
              >
                {/* Search input */}
                <div className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search cuisines…"
                    value={cuisineSearch}
                    onChange={(e) => setCuisineSearch(e.target.value)}
                    className="w-full bg-transparent font-mono text-ui-md px-4 py-2.5 outline-none placeholder:opacity-40"
                    style={{ color: "var(--text-secondary)" }}
                  />
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                  {!cuisineSearch && (
                    <button
                      onClick={() => { router.push(rankingsUrl(filters, { cuisine: "all", limit: 25 }), { scroll: false }); setCuisineOpen(false); }}
                      onMouseEnter={() => setHoveredCuisine("all")}
                      onMouseLeave={() => setHoveredCuisine(null)}
                      className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors duration-150"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: filters.cuisine === "all" || hoveredCuisine === "all" ? "var(--accent)" : "var(--text-tertiary)",
                        backgroundColor: filters.cuisine === "all" ? "var(--accent-tint-xs)" : hoveredCuisine === "all" ? "var(--accent-tint-xs)" : "transparent",
                      }}
                    >
                      All Cuisines
                    </button>
                  )}
                  {cuisines
                    .filter((c) => c.toLowerCase().includes(cuisineSearch.toLowerCase()))
                    .map((c) => (
                      <button
                        key={c}
                        onClick={() => { router.push(rankingsUrl(filters, { cuisine: c, limit: 25 }), { scroll: false }); setCuisineOpen(false); setCuisineSearch(""); }}
                        onMouseEnter={() => setHoveredCuisine(c)}
                        onMouseLeave={() => setHoveredCuisine(null)}
                        className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors duration-150"
                        style={{
                          borderColor: "var(--border-subtle)",
                          color: filters.cuisine === c || hoveredCuisine === c ? "var(--accent)" : "var(--text-tertiary)",
                          backgroundColor: filters.cuisine === c ? "var(--accent-tint-xs)" : hoveredCuisine === c ? "var(--accent-tint-xs)" : "transparent",
                        }}
                      >
                        {c}
                      </button>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Place Type dropdown */}
        <div className="relative">
          <button
            onClick={() => { setPlaceTypeOpen((o) => !o); setCuisineOpen(false); setExpOpen(false); setGfCategoryOpen(false); }}
            className="flex items-center gap-2 font-mono text-ui-md uppercase tracking-label px-4 py-3 transition-colors duration-150"
            style={{
              color: filters.placeType !== "all" ? "var(--accent)" : "var(--text-tertiary)",
              backgroundColor: filters.placeType !== "all" ? "var(--accent-tint-sm)" : "transparent",
            }}
          >
            <span className="text-ui-sm text-text-dim tracking-editorial">Type:</span>
            {filters.placeType === "all" ? "All" : (currentPlaceType?.label ?? filters.placeType)}
            <span className="text-ui-xs opacity-50">{placeTypeOpen ? "▲" : "▼"}</span>
          </button>

          {placeTypeOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPlaceTypeOpen(false)} />
              <div
                className="absolute left-0 top-full z-20 min-w-[180px] border"
                style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--border-default)" }}
              >
                {[{ label: "All Types", value: "all" }, ...PLACE_TYPE_OPTIONS].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { router.push(rankingsUrl(filters, { placeType: opt.value, limit: 25 }), { scroll: false }); setPlaceTypeOpen(false); }}
                    onMouseEnter={() => setHoveredPlaceType(opt.value)}
                    onMouseLeave={() => setHoveredPlaceType(null)}
                    className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors duration-150"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: filters.placeType === opt.value || hoveredPlaceType === opt.value ? "var(--accent)" : "var(--text-tertiary)",
                      backgroundColor: filters.placeType === opt.value ? "var(--accent-tint-xs)" : hoveredPlaceType === opt.value ? "var(--accent-tint-xs)" : "transparent",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Experience dropdown */}
        <div className="relative">
          <button
            onClick={() => { setExpOpen((o) => !o); setCuisineOpen(false); setPlaceTypeOpen(false); setGfCategoryOpen(false); }}
            className="flex items-center gap-2 font-mono text-ui-md uppercase tracking-label px-4 py-3 transition-colors duration-150"
            style={{
              color: filters.experience !== "all" ? "var(--accent)" : "var(--text-tertiary)",
              backgroundColor: filters.experience !== "all" ? "var(--accent-tint-sm)" : "transparent",
            }}
          >
            <span className="text-ui-sm text-text-dim tracking-editorial">Experience:</span>
            {currentExp.label}
            <span className="text-ui-xs opacity-50">{expOpen ? "▲" : "▼"}</span>
          </button>

          {expOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setExpOpen(false)} />
              <div
                className="absolute left-0 top-full z-20 min-w-[180px] border"
                style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--border-default)" }}
              >
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { router.push(rankingsUrl(filters, { experience: opt.value, limit: 25 }), { scroll: false }); setExpOpen(false); }}
                    onMouseEnter={() => setHoveredExp(opt.value)}
                    onMouseLeave={() => setHoveredExp(null)}
                    className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors duration-150"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: filters.experience === opt.value || hoveredExp === opt.value ? "var(--accent)" : "var(--text-tertiary)",
                      backgroundColor: filters.experience === opt.value ? "var(--accent-tint-xs)" : hoveredExp === opt.value ? "var(--accent-tint-xs)" : "transparent",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

      </div>

      {/* Active filter pills — second row, desktop only */}
      {activePills.length > 0 && (
        <div className="hidden md:flex items-center gap-2 py-2.5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          {activePills.map((pill) => (
            <Link
              key={pill.label}
              href={pill.clear}
              scroll={false}
              className="flex items-center gap-1.5 font-mono text-ui-sm uppercase tracking-label px-2.5 py-1 border transition-colors duration-150 hover:opacity-80"
              style={{ borderColor: "var(--accent-tint-xl)", backgroundColor: "var(--accent-tint-sm)", color: "var(--accent)" }}
            >
              {pill.label}
              <span className="text-ui-xs opacity-60">✕</span>
            </Link>
          ))}
          <Link
            href={clearAll}
            scroll={false}
            className="font-mono text-ui-sm uppercase tracking-editorial transition-colors duration-150 hover:text-white ml-1"
            style={{ color: "var(--text-dim)" }}
          >
            Clear all
          </Link>
        </div>
      )}

      {/* Mobile filter chips row */}
      <div
        className="md:hidden flex items-center gap-2 overflow-x-auto py-2.5 border-b"
        style={{ scrollbarWidth: "none", borderColor: "var(--border-subtle)" }}
      >
        {/* Boolean toggles — always visible */}
        <MobileChip
          label="GF Fryer"
          active={filters.fryer}
          href={rankingsUrl(filters, { fryer: !filters.fryer, limit: 25 })}
        />
        <MobileChip
          label="GF Labels"
          active={filters.labeled}
          href={rankingsUrl(filters, { labeled: !filters.labeled, limit: 25 })}
        />

        {/* Price pill → opens sheet */}
        <button
          onClick={() => setSheetOpen(true)}
          className="shrink-0 font-mono text-ui-sm uppercase tracking-label px-3 py-1.5 border transition-colors"
          style={{
            borderColor: filters.priceLevel > 0 ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
            backgroundColor: filters.priceLevel > 0 ? "var(--accent-tint-sm)" : "transparent",
            color: filters.priceLevel > 0 ? "var(--accent)" : "var(--text-label)",
          }}
        >
          {filters.priceLevel > 0 ? `Up to ${"$".repeat(filters.priceLevel)}` : "Price"}
          <span className="ml-1.5 text-ui-2xs opacity-40">▼</span>
        </button>

        {/* Place Type pill → opens sheet */}
        <button
          onClick={() => setSheetOpen(true)}
          className="shrink-0 font-mono text-ui-sm uppercase tracking-label px-3 py-1.5 border transition-colors"
          style={{
            borderColor: filters.placeType !== "all" ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
            backgroundColor: filters.placeType !== "all" ? "var(--accent-tint-sm)" : "transparent",
            color: filters.placeType !== "all" ? "var(--accent)" : "var(--text-label)",
          }}
        >
          {filters.placeType === "all" ? "Type" : (currentPlaceType?.label ?? filters.placeType)}
          <span className="ml-1.5 text-ui-2xs opacity-40">▼</span>
        </button>

        {/* GF Category pill → opens sheet */}
        <button
          onClick={() => setSheetOpen(true)}
          className="shrink-0 font-mono text-ui-sm uppercase tracking-label px-3 py-1.5 border transition-colors"
          style={{
            borderColor: filters.gfCategory !== "all" ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
            backgroundColor: filters.gfCategory !== "all" ? "var(--accent-tint-sm)" : "transparent",
            color: filters.gfCategory !== "all" ? "var(--accent)" : "var(--text-label)",
          }}
        >
          {filters.gfCategory === "all" ? "GF Food" : (currentGfCategory?.label ?? filters.gfCategory)}
          <span className="ml-1.5 text-ui-2xs opacity-40">▼</span>
        </button>

        {/* Cuisine pill → opens sheet */}
        <button
          onClick={() => setSheetOpen(true)}
          className="shrink-0 font-mono text-ui-sm uppercase tracking-label px-3 py-1.5 border transition-colors"
          style={{
            borderColor: filters.cuisine !== "all" ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
            backgroundColor: filters.cuisine !== "all" ? "var(--accent-tint-sm)" : "transparent",
            color: filters.cuisine !== "all" ? "var(--accent)" : "var(--text-label)",
          }}
        >
          {filters.cuisine === "all" ? "Cuisine" : filters.cuisine}
          <span className="ml-1.5 text-ui-2xs opacity-40">▼</span>
        </button>

        {/* Experience pill → opens sheet */}
        <button
          onClick={() => setSheetOpen(true)}
          className="shrink-0 font-mono text-ui-sm uppercase tracking-label px-3 py-1.5 border transition-colors"
          style={{
            borderColor: filters.experience !== "all" ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
            backgroundColor: filters.experience !== "all" ? "var(--accent-tint-sm)" : "transparent",
            color: filters.experience !== "all" ? "var(--accent)" : "var(--text-label)",
          }}
        >
          {filters.experience === "all" ? "Experience" : currentExp.label}
          <span className="ml-1.5 text-ui-2xs opacity-40">▼</span>
        </button>

        {/* Clear all */}
        {activeCount > 0 && (
          <Link
            href={clearAll}
            scroll={false}
            className="shrink-0 font-mono text-ui-sm uppercase tracking-editorial px-2 py-1.5 whitespace-nowrap transition-colors"
            style={{ color: "var(--text-label)" }}
          >
            Clear all
          </Link>
        )}
      </div>

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
            style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--border-emphasis)" }}
          >
            <div className="w-8 h-px mx-auto mb-7" style={{ backgroundColor: "var(--border-emphasis)" }} />

            <div className="flex flex-col gap-2 mb-7">
              <SheetToggle
                label="GF Fryer"
                active={filters.fryer}
                href={rankingsUrl(filters, { fryer: !filters.fryer, limit: 25 })}
                onNavigate={() => setSheetOpen(false)}
              />
              <SheetToggle
                label="GF Menu Labels"
                active={filters.labeled}
                href={rankingsUrl(filters, { labeled: !filters.labeled, limit: 25 })}
                onNavigate={() => setSheetOpen(false)}
              />
            </div>

            <p className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim mb-3">
              Price
            </p>
            <div className="flex gap-2 mb-7">
              {[{ label: "Any", value: 0 }, { label: "$", value: 1 }, { label: "$$", value: 2 }, { label: "$$$", value: 3 }, { label: "$$$$", value: 4 }].map((opt) => (
                <Link
                  key={opt.value}
                  href={rankingsUrl(filters, { priceLevel: opt.value, limit: 25 })}
                  scroll={false}
                  onClick={() => setSheetOpen(false)}
                  className="font-mono text-ui-md tracking-snug px-3 py-2.5 border transition-colors duration-150 text-center"
                  style={{
                    borderColor: filters.priceLevel === opt.value ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
                    backgroundColor: filters.priceLevel === opt.value ? "var(--accent-tint-md)" : "transparent",
                    color: filters.priceLevel === opt.value ? "var(--accent)" : "var(--text-tertiary)",
                  }}
                >
                  {opt.label}
                </Link>
              ))}
            </div>

            <p className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim mb-3">
              Place Type
            </p>
            <div className="flex flex-col gap-2 mb-7">
              {[{ label: "All Types", value: "all" }, ...PLACE_TYPE_OPTIONS].map((opt) => (
                <Link
                  key={opt.value}
                  href={rankingsUrl(filters, { placeType: opt.value, limit: 25 })}
                  scroll={false}
                  onClick={() => setSheetOpen(false)}
                  className="font-mono text-ui-md uppercase tracking-label px-4 py-3 border transition-colors duration-150"
                  style={{
                    borderColor: filters.placeType === opt.value ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
                    backgroundColor: filters.placeType === opt.value ? "var(--accent-tint-md)" : "transparent",
                    color: filters.placeType === opt.value ? "var(--accent)" : "var(--text-tertiary)",
                  }}
                >
                  {opt.label}
                </Link>
              ))}
            </div>

            <p className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim mb-3">
              GF Food
            </p>
            <div className="flex flex-col gap-2 mb-7">
              {[{ label: "All Categories", value: "all" }, ...GF_CATEGORY_OPTIONS].map((opt) => (
                <Link
                  key={opt.value}
                  href={rankingsUrl(filters, { gfCategory: opt.value, limit: 25 })}
                  scroll={false}
                  onClick={() => setSheetOpen(false)}
                  className="font-mono text-ui-md uppercase tracking-label px-4 py-3 border transition-colors duration-150"
                  style={{
                    borderColor: filters.gfCategory === opt.value ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
                    backgroundColor: filters.gfCategory === opt.value ? "var(--accent-tint-md)" : "transparent",
                    color: filters.gfCategory === opt.value ? "var(--accent)" : "var(--text-tertiary)",
                  }}
                >
                  {opt.label}
                </Link>
              ))}
            </div>

            <p className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim mb-3">
              Cuisine
            </p>
            <div className="flex flex-col gap-2 mb-7">
              <Link
                href={rankingsUrl(filters, { cuisine: "all", limit: 25 })}
                scroll={false}
                onClick={() => setSheetOpen(false)}
                className="font-mono text-ui-md uppercase tracking-label px-4 py-3 border transition-colors duration-150"
                style={{
                  borderColor: filters.cuisine === "all" ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
                  backgroundColor: filters.cuisine === "all" ? "var(--accent-tint-md)" : "transparent",
                  color: filters.cuisine === "all" ? "var(--accent)" : "var(--text-tertiary)",
                }}
              >
                All Cuisines
              </Link>
              {cuisines.map((c) => (
                <Link
                  key={c}
                  href={rankingsUrl(filters, { cuisine: c, limit: 25 })}
                  scroll={false}
                  onClick={() => setSheetOpen(false)}
                  className="font-mono text-ui-md uppercase tracking-label px-4 py-3 border transition-colors duration-150"
                  style={{
                    borderColor: filters.cuisine === c ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
                    backgroundColor: filters.cuisine === c ? "var(--accent-tint-md)" : "transparent",
                    color: filters.cuisine === c ? "var(--accent)" : "var(--text-tertiary)",
                  }}
                >
                  {c}
                </Link>
              ))}
            </div>

            <p className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim mb-3">
              Experience
            </p>
            <div className="flex flex-col gap-2 mb-8">
              {EXPERIENCE_OPTIONS.map((opt) => (
                <Link
                  key={opt.value}
                  href={rankingsUrl(filters, { experience: opt.value, limit: 25 })}
                  scroll={false}
                  onClick={() => setSheetOpen(false)}
                  className="font-mono text-ui-md uppercase tracking-label px-4 py-3 border transition-colors duration-150"
                  style={{
                    borderColor: filters.experience === opt.value ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
                    backgroundColor: filters.experience === opt.value ? "var(--accent-tint-md)" : "transparent",
                    color: filters.experience === opt.value ? "var(--accent)" : "var(--text-tertiary)",
                  }}
                >
                  {opt.label}
                </Link>
              ))}
            </div>

            {activeCount > 0 && (
              <Link
                href={clearAll}
                scroll={false}
                onClick={() => setSheetOpen(false)}
                className="block w-full text-center font-mono text-ui-md uppercase tracking-editorial py-3 border mb-3 transition-colors"
                style={{ borderColor: "var(--accent-tint-lg)", color: "var(--accent)", backgroundColor: "var(--accent-tint-xs)" }}
              >
                Clear all filters
              </Link>
            )}
            <button
              onClick={() => setSheetOpen(false)}
              className="w-full font-mono text-ui-md uppercase tracking-editorial py-3 border transition-colors"
              style={{ borderColor: "var(--border-emphasis)", color: "var(--text-tertiary)" }}
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

function FilterToggle({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="flex items-center gap-2.5 font-mono text-ui-md uppercase tracking-label px-4 py-3 transition-colors duration-150"
      style={{
        backgroundColor: active ? "var(--accent-tint-sm)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-tertiary)",
      }}
    >
      <span
        className="w-3.5 h-3.5 border flex items-center justify-center shrink-0 transition-colors duration-150"
        style={{
          borderColor: active ? "var(--accent)" : "var(--text-disabled)",
          backgroundColor: active ? "var(--accent)" : "transparent",
        }}
      >
        {active && <span className="text-ui-2xs leading-none" style={{ color: "var(--surface-base)", fontWeight: 700 }}>✓</span>}
      </span>
      {label}
    </Link>
  );
}

function MobileChip({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="shrink-0 flex items-center gap-1.5 font-mono text-ui-sm uppercase tracking-label px-3 py-1.5 border transition-colors"
      style={{
        borderColor: active ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
        backgroundColor: active ? "var(--accent-tint-sm)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-label)",
      }}
    >
      {active && (
        <span
          className="w-2.5 h-2.5 border flex items-center justify-center shrink-0"
          style={{ borderColor: "var(--accent)", backgroundColor: "var(--accent)" }}
        >
          <span className="text-[7px] leading-none font-bold" style={{ color: "var(--surface-base)" }}>✓</span>
        </span>
      )}
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
      scroll={false}
      onClick={onNavigate}
      className="flex items-center gap-3 font-mono text-ui-md uppercase tracking-label px-4 py-3 border transition-colors duration-150"
      style={{
        borderColor: active ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
        backgroundColor: active ? "var(--accent-tint-md)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-tertiary)",
      }}
    >
      <span
        className="w-3.5 h-3.5 border flex items-center justify-center shrink-0"
        style={{
          borderColor: active ? "var(--accent)" : "var(--text-disabled)",
          backgroundColor: active ? "var(--accent)" : "transparent",
        }}
      >
        {active && <span className="text-ui-2xs leading-none font-bold" style={{ color: "var(--surface-base)" }}>✓</span>}
      </span>
      {label}
    </Link>
  );
}
