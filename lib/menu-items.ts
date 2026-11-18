/**
 * Guards the Airtable menu_items AI field before it reaches
 * `restaurants.menu_items`. The restaurant page lists only items with
 * `gf: true` as the GF menu, so a `true` must be backed by the label the
 * model saw on the menu (`gf_marker`) — otherwise it is downgraded to null.
 *
 * Only applied to output from the marker-aware prompt (any item carries a
 * `gf_marker` key). Older output has no markers at all, and re-syncing it
 * unchanged must not wipe its GF items.
 *
 * Relative imports only: also used by scripts/ run via tsx.
 */

type RawItem = { gf?: unknown; gf_marker?: unknown; [k: string]: unknown };
type RawSection = { items?: unknown; [k: string]: unknown };

export interface MenuMarkerResult {
  menu: unknown;
  /** Items whose gf: true was downgraded for lacking a marker. */
  downgraded: number;
}

function sectionsOf(menu: unknown): RawSection[] | null {
  const sections = (menu as { menu_sections?: unknown } | null)?.menu_sections;
  return Array.isArray(sections) ? (sections as RawSection[]) : null;
}

function itemsOf(section: RawSection): RawItem[] {
  return Array.isArray(section?.items) ? (section.items as RawItem[]) : [];
}

export function enforceGfMarkers(menu: unknown): MenuMarkerResult {
  const sections = sectionsOf(menu);
  if (!sections) return { menu, downgraded: 0 };

  const markerAware = sections.some((s) => itemsOf(s).some((i) => i && typeof i === "object" && "gf_marker" in i));
  if (!markerAware) return { menu, downgraded: 0 };

  let downgraded = 0;
  for (const section of sections) {
    for (const item of itemsOf(section)) {
      if (!item || typeof item !== "object" || item.gf !== true) continue;
      const marker = typeof item.gf_marker === "string" ? item.gf_marker.trim() : "";
      if (!marker || /^(null|none|n\/a)$/i.test(marker)) {
        item.gf = null;
        item.gf_marker = null;
        downgraded++;
      }
    }
  }
  return { menu, downgraded };
}
