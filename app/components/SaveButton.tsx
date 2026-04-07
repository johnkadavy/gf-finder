"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type Props = {
  restaurantId: number;
  initialSaved: boolean;
  redirectPath?: string;
  onToggle?: (saved: boolean) => void;
};

export function SaveButton({ restaurantId, initialSaved, redirectPath, onToggle }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function toggle() {
    if (loading) return;
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const next = redirectPath ?? window.location.pathname;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    setLoading(true);
    if (saved) {
      await supabase
        .from("saved_restaurants")
        .delete()
        .eq("user_id", user.id)
        .eq("restaurant_id", restaurantId);
      setSaved(false);
      onToggle?.(false);
    } else {
      await supabase
        .from("saved_restaurants")
        .insert({ user_id: user.id, restaurant_id: restaurantId });
      setSaved(true);
      onToggle?.(true);
    }
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      aria-label={saved ? "Unsave restaurant" : "Save restaurant"}
      className="flex items-center justify-center w-8 h-8 transition-opacity disabled:opacity-40"
      style={{ color: saved ? "#FF7444" : "oklch(0.45 0 0)" }}
    >
      {saved ? (
        // Filled bookmark
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
      ) : (
        // Outlined bookmark
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
      )}
    </button>
  );
}
