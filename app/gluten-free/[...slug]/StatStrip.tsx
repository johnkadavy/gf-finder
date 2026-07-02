import { deriveKitchenStatus } from "@/lib/kitchen-status";
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
  display_name: string | null;
  dossier: ScoringDossier | null;
};

export function StatStrip({
  restaurants,
  entityLabel = "Restaurants",
}: {
  restaurants: TableRestaurant[];
  entityLabel?: string;
}) {
  const total = restaurants.length;
  const dedicated = restaurants.filter(
    (r) => deriveKitchenStatus(r.dedicated_gf_kitchen) === "dedicated"
  ).length;
  const excellent = restaurants.filter(
    (r) => r.score != null && r.score >= 85
  ).length;

  return (
    <div
      className="grid grid-cols-3 border mb-0"
      style={{ gap: "1px", background: "var(--border-subtle)", borderColor: "var(--border-subtle)" }}
    >
      <Stat label={`${entityLabel} Rated`} value={String(total)} accent="var(--accent)" />
      <Stat label="Dedicated GF Kitchens" value={String(dedicated)} accent="var(--accent)" />
      <Stat label="Scored Excellent · 85+" value={String(excellent)} accent="var(--score-excellent)" />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-[18px]" style={{ background: "var(--surface-base)" }}>
      <span
        className="font-[family-name:var(--font-display)] leading-none tabular-nums"
        style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", color: accent }}
      >
        {value}
      </span>
      <span className="font-mono text-ui-xs uppercase tracking-stamp" style={{ color: "var(--text-disabled)" }}>
        {label}
      </span>
    </div>
  );
}
