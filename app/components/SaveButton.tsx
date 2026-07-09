"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { capture } from "@/lib/analytics";

type Props = {
  restaurantId: number;
  initialSaved: boolean;
  redirectPath?: string;
  onToggle?: (saved: boolean) => void;
  showLabel?: boolean;
};

export function SaveButton({ restaurantId, initialSaved, redirectPath, onToggle, showLabel }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const router = useRouter();

  async function toggle() {
    if (loading) return;
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const next = redirectPath ?? window.location.pathname;
      capture("save_requires_login", { restaurant_id: restaurantId, source_path: next });
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
      capture("restaurant_unsaved", { restaurant_id: restaurantId });
    } else {
      await supabase
        .from("saved_restaurants")
        .insert({ user_id: user.id, restaurant_id: restaurantId });
      setSaved(true);
      onToggle?.(true);
      capture("restaurant_saved", { restaurant_id: restaurantId });
    }
    setLoading(false);
  }

  const color = saved ? "var(--accent)" : hovered ? "#FF9470" : "var(--accent)";

  return (
    <button
      onClick={toggle}
      disabled={loading}
      aria-label={saved ? "Unsave restaurant" : "Save restaurant"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-1.5 transition-opacity disabled:opacity-40"
      style={{ color }}
    >
      {saved ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
      )}
      {showLabel && (
        <span className="font-mono text-ui-sm uppercase tracking-label">
          {saved ? "Saved" : "Save"}
        </span>
      )}
    </button>
  );
}
