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
    .select("*")
    .limit(1);

  if (error) { console.error(error.message); process.exit(1); }
  if (!data?.[0]) { console.log("No rows found."); process.exit(0); }

  console.log("Columns in restaurants table:");
  for (const key of Object.keys(data[0])) {
    const val = data[0][key];
    console.log(`  ${key.padEnd(25)} ${val === null ? "null" : JSON.stringify(val).slice(0, 60)}`);
  }
}

main();
