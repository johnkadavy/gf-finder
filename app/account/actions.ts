"use server";

import { createClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

export async function updateDisplayName(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const name = (formData.get("display_name") as string ?? "").trim().slice(0, 40);

  await supabase
    .from("profiles")
    .update({ display_name: name || null })
    .eq("user_id", user.id);

  revalidatePath("/account");
}
