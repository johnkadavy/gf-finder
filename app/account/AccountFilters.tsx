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
            borderColor: city !== "all" ? "#FF744460" : "oklch(0.28 0 0)",
            backgroundColor: city !== "all" ? "#FF744410" : "oklch(0.1 0 0)",
          }}
        >
          <button
            onClick={() => { setCityOpen((o) => !o); setCuisineOpen(false); if (!cityOpen) setCitySearch(""); }}
            className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 h-full transition-colors"
            style={{ color: city !== "all" ? "#FF7444" : "oklch(0.72 0 0)" }}
          >
            {city === "all" ? "All Cities" : city}
            <span className="ml-2 text-[9px] opacity-40">{cityOpen ? "▲" : "▼"}</span>
          </button>
          {/* Always rendered to prevent layout shift — invisible when inactive */}
          <button
            onClick={() => navigate("all", cuisine)}
            className="pr-3 pl-1 h-full transition-colors hover:opacity-100"
            style={{
              color: "oklch(0.55 0 0)",
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
              style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.22 0 0)" }}
            >
              <div className="border-b" style={{ borderColor: "oklch(0.18 0 0)" }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search cities…"
                  value={citySearch}
                  onChange={(e) => setCitySearch(e.target.value)}
                  className="w-full bg-transparent font-mono text-[11px] px-4 py-2.5 outline-none placeholder:opacity-40"
                  style={{ color: "oklch(0.85 0 0)" }}
                />
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                {!citySearch && (
                  <button
                    onClick={() => { navigate("all", cuisine); setCityOpen(false); }}
                    onMouseEnter={() => setHoveredCity("all")}
                    onMouseLeave={() => setHoveredCity(null)}
                    className="w-full text-left font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 border-b transition-colors"
                    style={{
                      borderColor: "oklch(0.18 0 0)",
                      color: city === "all" || hoveredCity === "all" ? "#FF7444" : "oklch(0.72 0 0)",
                      backgroundColor: city === "all" ? "#FF744410" : hoveredCity === "all" ? "#FF744408" : "transparent",
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
                    className="w-full text-left font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 border-b transition-colors"
                    style={{
                      borderColor: "oklch(0.18 0 0)",
                      color: city === c || hoveredCity === c ? "#FF7444" : "oklch(0.72 0 0)",
                      backgroundColor: city === c ? "#FF744410" : hoveredCity === c ? "#FF744408" : "transparent",
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
          className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] px-4 h-9 border transition-colors"
          style={{
            borderColor: cuisine !== "all" ? "#FF744460" : "oklch(0.28 0 0)",
            backgroundColor: cuisine !== "all" ? "#FF744410" : "oklch(0.1 0 0)",
            color: cuisine !== "all" ? "#FF7444" : "oklch(0.72 0 0)",
          }}
        >
          <span className="text-[10px] text-[oklch(0.6_0_0)] tracking-[0.2em]">Cuisine:</span>
          {cuisine === "all" ? "All" : cuisine}
          <span className="text-[9px] opacity-50">{cuisineOpen ? "▲" : "▼"}</span>
        </button>
        {cuisineOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setCuisineOpen(false)} />
            <div
              className="absolute left-0 top-full z-20 min-w-[220px] border"
              style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.22 0 0)" }}
            >
              <div className="border-b" style={{ borderColor: "oklch(0.18 0 0)" }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search cuisines…"
                  value={cuisineSearch}
                  onChange={(e) => setCuisineSearch(e.target.value)}
                  className="w-full bg-transparent font-mono text-[11px] px-4 py-2.5 outline-none placeholder:opacity-40"
                  style={{ color: "oklch(0.85 0 0)" }}
                />
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                {!cuisineSearch && (
                  <button
                    onClick={() => { navigate(city, "all"); setCuisineOpen(false); }}
                    onMouseEnter={() => setHoveredCuisine("all")}
                    onMouseLeave={() => setHoveredCuisine(null)}
                    className="w-full text-left font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 border-b transition-colors"
                    style={{
                      borderColor: "oklch(0.18 0 0)",
                      color: cuisine === "all" || hoveredCuisine === "all" ? "#FF7444" : "oklch(0.72 0 0)",
                      backgroundColor: cuisine === "all" ? "#FF744410" : hoveredCuisine === "all" ? "#FF744408" : "transparent",
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
                    className="w-full text-left font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 border-b transition-colors"
                    style={{
                      borderColor: "oklch(0.18 0 0)",
                      color: cuisine === c || hoveredCuisine === c ? "#FF7444" : "oklch(0.72 0 0)",
                      backgroundColor: cuisine === c ? "#FF744410" : hoveredCuisine === c ? "#FF744408" : "transparent",
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
