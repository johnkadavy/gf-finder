/**
 * Keep the stored `restaurants.score` column in sync after any write that
 * changes scoring inputs (dossier, verified_data, cuisine, place_type).
 * Lists (rankings, landing pages, search) sort and display the stored score;
 * restaurant pages compute it live — both use scoreRestaurant(), so as long
 * as every writer calls this, they agree.
 *
 * Relative imports only: also used by scripts/ run via tsx.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreRestaurant } from "./score";

export const SCORE_INPUT_COLUMNS = "id, score, dossier, verified_data, cuisine, place_type";

type ScoreRow = {
  id: number;
  score: number | null;
  dossier: unknown;
  verified_data: unknown;
  cuisine: string | null;
  place_type: string[] | null;
};

/**
 * Recompute and store scores for the rows matching `column = value`
 * (or any of `ids`). Returns how many stored scores actually changed.
 * Never throws — a failed rescore is logged, the caller's write still stands,
 * and the next backfill will catch it.
 */
export async function rescoreRestaurants(
  client: SupabaseClient,
  match: { column: "id" | "google_place_id"; value: string | number } | { ids: number[] },
): Promise<number> {
  try {
    let query = client.from("restaurants").select(SCORE_INPUT_COLUMNS);
    query = "ids" in match ? query.in("id", match.ids) : query.eq(match.column, match.value);
    const { data, error } = await query;
    if (error || !data) {
      console.error("[rescore] fetch failed:", error?.message);
      return 0;
    }
    let changed = 0;
    for (const row of data as ScoreRow[]) {
      const next = scoreRestaurant(row);
      if (next === null || next === row.score) continue;
      const { error: upErr } = await client.from("restaurants").update({ score: next }).eq("id", row.id);
      if (upErr) console.error(`[rescore] update failed for ${row.id}:`, upErr.message);
      else changed++;
    }
    return changed;
  } catch (e) {
    console.error("[rescore] unexpected error:", e);
    return 0;
  }
}
