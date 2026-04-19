/**
 * Custom neighborhood zones checked before the NTA polygon lookup.
 * Used to split compound NTAs into colloquial sub-neighborhoods.
 *
 * Coordinates are [lng, lat] (GeoJSON order), closed rings.
 * First-match wins, so order matters where zones are adjacent or overlap.
 *
 * Approximate boundaries are intentional: ~50–100m of imprecision at an edge
 * is irrelevant at a neighborhood scale.
 */

export interface CustomZone {
  name: string;
  /** Closed polygon ring in [lng, lat] order */
  polygon: [number, number][];
}

// Reference streets (approx lat):
//   Canal St 40.719 | Spring St 40.722 | Houston St 40.728
//   14th St 40.736 | 23rd St 40.741 | 27th St 40.745 | 34th St 40.750
//   42nd St 40.756 | 59th St 40.768
//   Chambers St (FiDi north) 40.714
//
// Reference avenues (approx lng):
//   West Side Hwy (lower) -74.013 | Varick/6th Ave (lower) -74.006
//   Broadway (lower) -73.999 | Lafayette -73.997 | Bowery -73.992
//   9th Ave (Midtown) -73.994 | 8th Ave (Midtown) -73.989
//
// Brooklyn (lat): Atlantic Ave ≈40.688 | Union St ≈40.682 | Red Hook ≈40.671
// Brooklyn (lng): Columbia St ≈-74.002 | Smith St ≈-73.996
//   Court St ≈-73.993 | Boerum Hill/3rd Ave ≈-73.984

export const CUSTOM_ZONES: CustomZone[] = [

  // ── SoHo / Nolita / Little Italy / Hudson Square ─────────────────────────
  // Parent NTA: "SoHo-Little Italy-Hudson Square"

  {
    name: "Hudson Square",
    // West of Varick/6th Ave, Canal St to Houston St
    polygon: [
      [-74.016, 40.719], [-74.006, 40.719],
      [-74.006, 40.728], [-74.016, 40.728],
      [-74.016, 40.719],
    ],
  },
  {
    name: "SoHo",
    // Varick/6th Ave to Broadway, Canal St to Houston St
    polygon: [
      [-74.006, 40.719], [-73.998, 40.719],
      [-73.998, 40.728], [-74.006, 40.728],
      [-74.006, 40.719],
    ],
  },
  {
    name: "Nolita",
    // East of Broadway, Spring St (~40.722) to Houston St
    polygon: [
      [-73.998, 40.722], [-73.989, 40.722],
      [-73.989, 40.728], [-73.998, 40.728],
      [-73.998, 40.722],
    ],
  },
  {
    name: "Little Italy",
    // East of Broadway, Canal St to Spring St (~40.722)
    polygon: [
      [-73.998, 40.719], [-73.989, 40.719],
      [-73.989, 40.722], [-73.998, 40.722],
      [-73.998, 40.719],
    ],
  },

  // ── DUMBO ─────────────────────────────────────────────────────────────────
  // Parent NTA: "Downtown Brooklyn-DUMBO-Boerum Hill"
  // Placed before Financial District because the FiDi rectangle spans the East
  // River — DUMBO must be checked first to avoid Brooklyn coords matching FiDi.

  {
    name: "DUMBO",
    // Under the Manhattan Bridge, north of York St
    polygon: [
      [-73.997, 40.701], [-73.981, 40.701],
      [-73.981, 40.707], [-73.997, 40.707],
      [-73.997, 40.701],
    ],
  },

  // ── Financial District / Battery Park City ────────────────────────────────
  // Parent NTA: "Financial District-Battery Park City"

  {
    name: "Battery Park City",
    // Westernmost strip of lower Manhattan (west of West St)
    polygon: [
      [-74.024, 40.695], [-74.013, 40.695],
      [-74.013, 40.719], [-74.024, 40.719],
      [-74.024, 40.695],
    ],
  },
  {
    name: "Financial District",
    // South of Chambers/Tribeca, east of West St
    polygon: [
      [-74.013, 40.695], [-73.970, 40.695],
      [-73.970, 40.714], [-74.013, 40.714],
      [-74.013, 40.695],
    ],
  },

  // ── Flatiron / Union Square / NoMad ──────────────────────────────────────
  // Parent NTA: "Midtown South-Flatiron-Union Square"
  // Most of this NTA → "Flatiron" via alias; these zones carve out the two
  // sub-neighborhoods that differ meaningfully.

  {
    name: "Union Square",
    // 14th to 17th St, 5th Ave to Park Ave South
    polygon: [
      [-73.993, 40.734], [-73.984, 40.734],
      [-73.984, 40.738], [-73.993, 40.738],
      [-73.993, 40.734],
    ],
  },
  {
    name: "NoMad",
    // 27th to 30th St, Madison/Broadway corridor
    polygon: [
      [-73.994, 40.744], [-73.980, 40.744],
      [-73.980, 40.748], [-73.994, 40.748],
      [-73.994, 40.744],
    ],
  },

  // ── Hell's Kitchen extension ──────────────────────────────────────────────
  // The NTA "Hell's Kitchen" covers west of ~9th Ave; this zone catches the
  // colloquial Hell's Kitchen area that spills into "Midtown-Times Square" NTA.

  {
    name: "Hell's Kitchen",
    // 34th to 59th St, 9th Ave to just past 8th Ave
    // East boundary at -73.986 catches restaurants on 8th Ave itself
    polygon: [
      [-73.995, 40.750], [-73.986, 40.750],
      [-73.986, 40.768], [-73.995, 40.768],
      [-73.995, 40.750],
    ],
  },

  // ── Boerum Hill ───────────────────────────────────────────────────────────
  // Parent NTA: "Downtown Brooklyn-DUMBO-Boerum Hill"

  {
    name: "Boerum Hill",
    // Hoyt/Bond/3rd Ave corridor, south of Atlantic Ave
    // West boundary (-73.994) meets Cobble Hill's east boundary — no overlap
    polygon: [
      [-73.994, 40.682], [-73.979, 40.682],
      [-73.979, 40.689], [-73.994, 40.689],
      [-73.994, 40.682],
    ],
  },
  // Remainder of the NTA falls back to "Downtown Brooklyn" via alias

  // ── Carroll Gardens / Cobble Hill / Gowanus / Red Hook ───────────────────
  // Parent NTA: "Carroll Gardens-Cobble Hill-Gowanus-Red Hook"

  {
    name: "Red Hook",
    // Western waterfront peninsula
    polygon: [
      [-74.022, 40.669], [-74.001, 40.669],
      [-74.001, 40.682], [-74.022, 40.682],
      [-74.022, 40.669],
    ],
  },
  {
    name: "Cobble Hill",
    // Court/Smith/Clinton corridor, Atlantic Ave to Union St
    // East boundary (-73.994) aligns with Boerum Hill's west edge — no overlap
    polygon: [
      [-74.004, 40.682], [-73.994, 40.682],
      [-73.994, 40.690], [-74.004, 40.690],
      [-74.004, 40.682],
    ],
  },
  {
    name: "Carroll Gardens",
    // Columbia/Clinton/Smith, Union St to Carroll/President
    polygon: [
      [-74.004, 40.674], [-73.990, 40.674],
      [-73.990, 40.682], [-74.004, 40.682],
      [-74.004, 40.674],
    ],
  },
  {
    name: "Gowanus",
    // Around the canal, east of Smith St, west of 4th Ave
    polygon: [
      [-73.993, 40.669], [-73.975, 40.669],
      [-73.975, 40.690], [-73.993, 40.690],
      [-73.993, 40.669],
    ],
  },
];
