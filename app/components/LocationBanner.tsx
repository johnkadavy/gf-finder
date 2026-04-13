"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function LocationBanner({ cities }: { cities: string[] }) {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const dismissed = sessionStorage.getItem("location_dismissed");
    const hasCity = new URLSearchParams(window.location.search).has("city");
    if (!dismissed && !hasCity) {
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  function dismiss() {
    sessionStorage.setItem("location_dismissed", "1");
    setVisible(false);
  }

  async function handleAllow() {
    // Dismiss immediately — don't make the user wait while we look up location
    dismiss();
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
      );

      const { latitude: lat, longitude: lng } = pos.coords;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
      );
      const data = await res.json();
      const detected: string =
        data.address?.city ??
        data.address?.town ??
        data.address?.village ??
        "";

      const matched = cities.find(
        (c) => c.toLowerCase() === detected.toLowerCase()
      );

      if (matched) {
        router.push(`/?city=${encodeURIComponent(matched)}`);
      }
    } catch {
      // Silently fail — banner is already gone
    }
  }

  if (!visible) return null;

  return (
    <div
      className="md:hidden fixed bottom-[4.5rem] left-3 right-3 z-40 border flex items-center gap-3 px-4 py-3 transition-all"
      style={{ backgroundColor: "oklch(0.11 0 0)", borderColor: "oklch(0.26 0 0)" }}
    >
      <p className="flex-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.78_0_0)] leading-snug">
        Find GF restaurants near you
      </p>
      <button
        onClick={handleAllow}
        className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 border transition-colors"
        style={{ borderColor: "#FF7444", color: "#FF7444" }}
      >
        Allow
      </button>
      <button
        onClick={dismiss}
        className="shrink-0 font-mono text-[10px] text-[oklch(0.4_0_0)] hover:text-[oklch(0.65_0_0)] transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
