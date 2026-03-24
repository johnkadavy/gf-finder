/**
 * Lists all neighborhoods with street count and restaurant count.
 *
 * Usage:
 *   npx tsx scripts/list-neighborhoods.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: neighborhoods, error } = await supabase
    .from("neighborhoods")
    .select("id, name, city, state, active")
    .order("city, name");

  if (error) {
    console.error("Failed to fetch neighborhoods:", error.message);
    process.exit(1);
  }

  if (!neighborhoods || neighborhoods.length === 0) {
    console.log("No neighborhoods set up yet. Run setup-neighborhood.ts first.");
    process.exit(0);
  }

  console.log("\nGF Finder — Neighborhoods\n");
  console.log(
    "  " +
      "Neighborhood".padEnd(25) +
      "City".padEnd(20) +
      "State".padEnd(8) +
      "Streets".padEnd(10) +
      "Restaurants".padEnd(14) +
      "Active"
  );
  console.log("  " + "─".repeat(82));

  for (const n of neighborhoods) {
    const { count: streetCount } = await supabase
      .from("neighborhood_streets")
      .select("*", { count: "exact", head: true })
      .eq("neighborhood_id", n.id)
      .eq("active", true);

    const { count: restaurantCount } = await supabase
      .from("restaurants")
      .select("*", { count: "exact", head: true })
      .eq("neighborhood", n.name)
      .eq("city", n.city);

    console.log(
      "  " +
        n.name.padEnd(25) +
        n.city.padEnd(20) +
        n.state.padEnd(8) +
        String(streetCount ?? 0).padEnd(10) +
        String(restaurantCount ?? 0).padEnd(14) +
        (n.active ? "yes" : "no")
    );
  }

  console.log();
}

main();
