"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  cities: string[];
  cuisines: string[];
  city: string;
  cuisine: string;
};

function accountUrl(city: string, cuisine: string) {
  const params = new URLSearchParams();
  if (city !== "all") params.set("city", city);
  if (cuisine !== "all") params.set("cuisine", cuisine);
  const qs = params.toString();
  return `/account${qs ? `?${qs}` : ""}`;
}

export function AccountFilters({ cities, cuisines, city, cuisine }: Props) {
  const router = useRouter();
  const [cityOpen, setCityOpen] = useState(false);
  const [cuisineOpen, setCuisineOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [cuisineSearch, setCuisineSearch] = useState("");
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [hoveredCuisine, setHoveredCuisine] = useState<string | null>(null);

  const filteredCities = cities.filter((c) => c.toLowerCase().includes(citySearch.toLowerCase()));
  const filteredCuisines = cuisines.filter((c) => c.toLowerCase().includes(cuisineSearch.toLowerCase()));

  const navigate = (newCity: string, newCuisine: string) => {
    router.push(accountUrl(newCity, newCuisine));
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">

      {/* City dropdown */}
      <div className="relative">
        <div
          className="flex items-center border h-9"
          style={{
            borderColor: city !== "all" ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
            backgroundColor: city !== "all" ? "var(--accent-tint-xs)" : "var(--surface-raised)",
          }}
        >
          <button
            onClick={() => { setCityOpen((o) => !o); setCuisineOpen(false); if (!cityOpen) setCitySearch(""); }}
            className="font-mono text-ui-md uppercase tracking-label px-4 h-full transition-colors"
            style={{ color: city !== "all" ? "var(--accent)" : "var(--text-tertiary)" }}
          >
            {city === "all" ? "All Cities" : city}
            <span className="ml-2 text-ui-xs opacity-40">{cityOpen ? "▲" : "▼"}</span>
          </button>
          {/* Always rendered to prevent layout shift — invisible when inactive */}
          <button
            onClick={() => navigate("all", cuisine)}
            className="pr-3 pl-1 h-full transition-colors hover:opacity-100"
            style={{
              color: "var(--text-dim)",
              visibility: city !== "all" ? "visible" : "hidden",
              pointerEvents: city !== "all" ? "auto" : "none",
            }}
          >✕</button>
        </div>
        {cityOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setCityOpen(false)} />
            <div
              className="absolute left-0 top-full z-20 min-w-[200px] border"
              style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--border-default)" }}
            >
              <div className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search cities…"
                  value={citySearch}
                  onChange={(e) => setCitySearch(e.target.value)}
                  className="w-full bg-transparent font-mono text-ui-md px-4 py-2.5 outline-none placeholder:opacity-40"
                  style={{ color: "var(--text-secondary)" }}
                />
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                {!citySearch && (
                  <button
                    onClick={() => { navigate("all", cuisine); setCityOpen(false); }}
                    onMouseEnter={() => setHoveredCity("all")}
                    onMouseLeave={() => setHoveredCity(null)}
                    className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: city === "all" || hoveredCity === "all" ? "var(--accent)" : "var(--text-tertiary)",
                      backgroundColor: city === "all" ? "var(--accent-tint-xs)" : hoveredCity === "all" ? "var(--accent-tint-xs)" : "transparent",
                    }}
                  >
                    All Cities
                  </button>
                )}
                {filteredCities.map((c) => (
                  <button
                    key={c}
                    onClick={() => { navigate(c, cuisine); setCityOpen(false); setCitySearch(""); }}
                    onMouseEnter={() => setHoveredCity(c)}
                    onMouseLeave={() => setHoveredCity(null)}
                    className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: city === c || hoveredCity === c ? "var(--accent)" : "var(--text-tertiary)",
                      backgroundColor: city === c ? "var(--accent-tint-xs)" : hoveredCity === c ? "var(--accent-tint-xs)" : "transparent",
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

      {/* Cuisine dropdown */}
      <div className="relative">
        <button
          onClick={() => { setCuisineOpen((o) => !o); setCityOpen(false); if (!cuisineOpen) setCuisineSearch(""); }}
          className="flex items-center gap-2 font-mono text-ui-md uppercase tracking-label px-4 h-9 border transition-colors"
          style={{
            borderColor: cuisine !== "all" ? "var(--accent-tint-xl)" : "var(--border-emphasis)",
            backgroundColor: cuisine !== "all" ? "var(--accent-tint-xs)" : "var(--surface-raised)",
            color: cuisine !== "all" ? "var(--accent)" : "var(--text-tertiary)",
          }}
        >
          <span className="text-ui-sm text-text-dim tracking-editorial">Cuisine:</span>
          {cuisine === "all" ? "All" : cuisine}
          <span className="text-ui-xs opacity-50">{cuisineOpen ? "▲" : "▼"}</span>
        </button>
        {cuisineOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setCuisineOpen(false)} />
            <div
              className="absolute left-0 top-full z-20 min-w-[220px] border"
              style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--border-default)" }}
            >
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
                    onClick={() => { navigate(city, "all"); setCuisineOpen(false); }}
                    onMouseEnter={() => setHoveredCuisine("all")}
                    onMouseLeave={() => setHoveredCuisine(null)}
                    className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: cuisine === "all" || hoveredCuisine === "all" ? "var(--accent)" : "var(--text-tertiary)",
                      backgroundColor: cuisine === "all" ? "var(--accent-tint-xs)" : hoveredCuisine === "all" ? "var(--accent-tint-xs)" : "transparent",
                    }}
                  >
                    All Cuisines
                  </button>
                )}
                {filteredCuisines.map((c) => (
                  <button
                    key={c}
                    onClick={() => { navigate(city, c); setCuisineOpen(false); setCuisineSearch(""); }}
                    onMouseEnter={() => setHoveredCuisine(c)}
                    onMouseLeave={() => setHoveredCuisine(null)}
                    className="w-full text-left font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border-b transition-colors"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: cuisine === c || hoveredCuisine === c ? "var(--accent)" : "var(--text-tertiary)",
                      backgroundColor: cuisine === c ? "var(--accent-tint-xs)" : hoveredCuisine === c ? "var(--accent-tint-xs)" : "transparent",
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

    </div>
  );
}
