import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name, neighborhood, city, enriched_at")
    .order("neighborhood, name");

  if (error) { console.error(error.message); process.exit(1); }

  for (const r of data ?? []) {
    const status = r.enriched_at ? "✓" : "✗";
    console.log(`${status} ${r.name.padEnd(40)} ${(r.neighborhood ?? "").padEnd(20)} ${r.city}`);
  }

  const unenriched = (data ?? []).filter((r) => !r.enriched_at);
  console.log(`\nTotal: ${data?.length ?? 0}  |  Unenriched: ${unenriched.length}`);
}

main();
