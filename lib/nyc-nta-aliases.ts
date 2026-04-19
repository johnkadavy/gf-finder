/**
 * Maps official NTA (Neighborhood Tabulation Area) names to colloquial names.
 * Applied after polygon lookup as a final translation step.
 *
 * Only entries that differ from the NTA name are listed here.
 * NTAs that need geographic splits (not just renaming) are handled in
 * nyc-custom-zones.ts; their fallback alias is also listed here so that
 * any point not caught by a custom zone still gets a reasonable label.
 */
export const NTA_ALIASES: Record<string, string> = {
  // ── Manhattan ─────────────────────────────────────────────────────────────

  // Compound NTAs — fallback when custom-zone split doesn't catch the point
  "SoHo-Little Italy-Hudson Square":         "SoHo",
  "Financial District-Battery Park City":    "Financial District",
  "Midtown South-Flatiron-Union Square":     "Flatiron",
  "Chinatown-Two Bridges":                   "Chinatown",
  "Tribeca-Civic Center":                    "Tribeca",

  // Midtown — custom zone handles Hell's Kitchen overlay; rest → Midtown
  "Midtown-Times Square":                    "Midtown",

  // Chelsea
  "Chelsea-Hudson Yards":                    "Chelsea",

  // East side Midtown
  "East Midtown-Turtle Bay":                 "Midtown East",

  // Flatiron sub-zones (Union Square + NoMad covered by custom zones)
  "Murray Hill-Kips Bay":                    "Murray Hill",

  // Stuyvesant Town / Peter Cooper Village
  "Stuyvesant Town-Peter Cooper Village":    "Stuyvesant Town",

  // Upper West Side — three NTAs merge into one colloquial name
  "Upper West Side-Lincoln Square":          "Upper West Side",
  "Upper West Side (Central)":               "Upper West Side",
  "Upper West Side-Manhattan Valley":        "Upper West Side",

  // Upper East Side
  "Upper East Side-Lenox Hill-Roosevelt Island": "Upper East Side",
  "Upper East Side-Carnegie Hill":           "Carnegie Hill",
  "Upper East Side-Yorkville":               "Yorkville",

  // Harlem
  "Harlem (South)":                          "Harlem",
  "Harlem (North)":                          "Harlem",
  "East Harlem (South)":                     "East Harlem",
  "East Harlem (North)":                     "East Harlem",
  "Manhattanville-West Harlem":              "West Harlem",
  "Hamilton Heights-Sugar Hill":             "Hamilton Heights",

  // Washington Heights
  "Washington Heights (South)":             "Washington Heights",
  "Washington Heights (North)":             "Washington Heights",

  // ── Brooklyn ──────────────────────────────────────────────────────────────

  // Compound NTAs — fallback aliases
  "Downtown Brooklyn-DUMBO-Boerum Hill":     "Downtown Brooklyn",
  "Carroll Gardens-Cobble Hill-Gowanus-Red Hook": "Carroll Gardens",

  // Bed-Stuy
  "Bedford-Stuyvesant (West)":               "Bed-Stuy",
  "Bedford-Stuyvesant (East)":               "Bed-Stuy",

  // Bushwick
  "Bushwick (West)":                         "Bushwick",
  "Bushwick (East)":                         "Bushwick",

  // Crown Heights
  "Crown Heights (North)":                   "Crown Heights",
  "Crown Heights (South)":                   "Crown Heights",

  // East New York
  "East New York (North)":                   "East New York",
  "East New York-City Line":                 "East New York",
  "East New York-New Lots":                  "East New York",
  "Spring Creek-Starrett City":              "East New York",

  // East Flatbush
  "East Flatbush-Erasmus":                   "East Flatbush",
  "East Flatbush-Farragut":                  "East Flatbush",
  "East Flatbush-Remsen Village":            "East Flatbush",
  "East Flatbush-Rugby":                     "East Flatbush",

  // Ditmas Park (the main colloquial name for that corridor)
  "Flatbush (West)-Ditmas Park-Parkville":   "Ditmas Park",

  // Gravesend
  "Gravesend (East)-Homecrest":              "Gravesend",
  "Gravesend (South)":                       "Gravesend",
  "Gravesend (West)":                        "Gravesend",

  // Prospect Lefferts Gardens
  "Prospect Lefferts Gardens-Wingate":       "Prospect Lefferts Gardens",

  // Windsor Terrace / South Slope
  "Windsor Terrace-South Slope":             "Windsor Terrace",

  // Sunset Park
  "Sunset Park (Central)":                   "Sunset Park",
  "Sunset Park (East)-Borough Park (West)":  "Sunset Park",
  "Sunset Park (West)":                      "Sunset Park",

  // Coney Island
  "Coney Island-Sea Gate":                   "Coney Island",

  // Sheepshead Bay
  "Sheepshead Bay-Manhattan Beach-Gerritsen Beach": "Sheepshead Bay",

  // Marine Park
  "Marine Park-Mill Basin-Bergen Beach":     "Marine Park",

  // ── Queens ────────────────────────────────────────────────────────────────

  // Astoria — three NTAs, all colloquially "Astoria"
  "Astoria (Central)":                       "Astoria",
  "Astoria (North)-Ditmars-Steinway":        "Astoria",
  "Old Astoria-Hallets Point":               "Astoria",
  // Astoria (East) straddles the Woodside border — custom zone handles it;
  // this alias is the fallback
  "Astoria (East)-Woodside (North)":         "Astoria",

  // Long Island City
  "Long Island City-Hunters Point":          "Long Island City",
  "Queensbridge-Ravenswood-Dutch Kills":     "Long Island City",

  // Flushing
  "Flushing-Willets Point":                  "Flushing",
  "Murray Hill-Broadway Flushing":           "Flushing",

  // Jamaica
  "Jamaica Estates-Holliswood":              "Jamaica Estates",
  "Jamaica Hills-Briarwood":                 "Briarwood",

  // Rockaway
  "Breezy Point-Belle Harbor-Rockaway Park-Broad Channel": "Rockaway",
  "Far Rockaway-Bayswater":                  "Far Rockaway",
  "Rockaway Beach-Arverne-Edgemere":         "Rockaway Beach",

  // South Queens
  "South Richmond Hill":                     "Richmond Hill",
  "Springfield Gardens (North)-Rochdale Village": "Springfield Gardens",
  "Springfield Gardens (South)-Brookville": "Springfield Gardens",
  "South Ozone Park":                        "Ozone Park",
  "Oakland Gardens-Hollis Hills":            "Oakland Gardens",
  "Pomonok-Electchester-Hillcrest":          "Hillcrest",
  "Fresh Meadows-Utopia":                    "Fresh Meadows",
  "Glen Oaks-Floral Park-New Hyde Park":     "Glen Oaks",
  "Bay Terrace-Clearview":                   "Bay Terrace",
  "Whitestone-Beechhurst":                   "Whitestone",
  "Howard Beach-Lindenwood":                 "Howard Beach",
  "Ozone Park (North)":                      "Ozone Park",

  // ── Bronx ─────────────────────────────────────────────────────────────────

  "Mott Haven-Port Morris":                  "Mott Haven",
  "Kingsbridge Heights-Van Cortlandt Village": "Kingsbridge Heights",
  "Kingsbridge-Marble Hill":                 "Kingsbridge",
  "University Heights (North)-Fordham":      "University Heights",
  "University Heights (South)-Morris Heights": "Morris Heights",
  "Claremont Village-Claremont (East)":      "Claremont Village",
  "Mount Eden-Claremont (West)":             "Mount Eden",
  "Soundview-Bruckner-Bronx River":          "Soundview",
  "Soundview-Clason Point":                  "Soundview",
  "Throgs Neck-Schuylerville":               "Throgs Neck",
  "Eastchester-Edenwald-Baychester":         "Eastchester",
  "Pelham Bay-Country Club-City Island":     "Pelham Bay",
  "Pelham Parkway-Van Nest":                 "Pelham Parkway",
  "Riverdale-Spuyten Duyvil":                "Riverdale",
  "Wakefield-Woodlawn":                      "Woodlawn",
  "Concourse-Concourse Village":             "Concourse Village",
  "Castle Hill-Unionport":                   "Castle Hill",

  // ── Staten Island ─────────────────────────────────────────────────────────

  "Grasmere-Arrochar-South Beach-Dongan Hills":    "South Beach",
  "Tompkinsville-Stapleton-Clifton-Fox Hills":      "Stapleton",
  "Todt Hill-Emerson Hill-Lighthouse Hill-Manor Heights": "Todt Hill",
  "Annadale-Huguenot-Prince's Bay-Woodrow":        "Annadale",
  "Arden Heights-Rossville":                        "Arden Heights",
  "Great Kills-Eltingville":                        "Great Kills",
  "Mariner's Harbor-Arlington-Graniteville":        "Mariner's Harbor",
  "New Springville-Willowbrook-Bulls Head-Travis":  "New Springville",
  "West New Brighton-Silver Lake-Grymes Hill":      "West New Brighton",
  "Westerleigh-Castleton Corners":                  "Westerleigh",
  "Rosebank-Shore Acres-Park Hill":                 "Rosebank",
  "St. George-New Brighton":                        "St. George",
};
