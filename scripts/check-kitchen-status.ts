// Eyeball check: run deriveKitchenStatus across the NYC GF bakery result set
// (same query the city-level /gluten-free/new-york/bakery page uses)
// and print the underlying dossier fields so false "dedicated" signals can
// be spotted before the column is used in production.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { deriveKitchenStatus } from "../lib/kitchen-status";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await supabase
    .from("restaurants")
    .select("name, score, dossier")
    .not("score", "is", null)
    .eq("city", "New York")
    .gte("score", 75)
    .contains("gf_food_categories", ["gf_baked_goods"])
    .order("score", { ascending: false })
    .limit(25);

  if (error || !data) {
    console.error("Query error:", error);
    process.exit(1);
  }

  const col = {
    name:   40,
    score:  7,
    status: 18,
    risk:   28,
    prep:   0,
  };

  console.log("\nKitchen Status Check — NYC GF Bakeries (score ≥ 75)\n");
  console.log(
    "Name".padEnd(col.name),
    "Score".padEnd(col.score),
    "Derived status".padEnd(col.status),
    "cross_contamination_risk".padEnd(col.risk),
    "prep_area",
  );
  console.log("─".repeat(115));

  for (const r of data) {
    const status = deriveKitchenStatus(r.dossier);
    const risk   = r.dossier?.operations?.cross_contamination_risk ?? "—";
    const prep   = r.dossier?.operations?.dedicated_equipment?.prep_area ?? "—";
    const score  = r.score != null ? String(Math.round(r.score)) : "—";

    console.log(
      r.name.substring(0, col.name - 2).padEnd(col.name),
      score.padEnd(col.score),
      (status ?? "null").padEnd(col.status),
      String(risk).padEnd(col.risk),
      String(prep),
    );
  }

  console.log("\nTotal rows:", data.length);
}

main();
