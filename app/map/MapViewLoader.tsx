"use client";

import dynamic from "next/dynamic";

// Dynamic import with ssr:false must live in a Client Component
const MapView = dynamic(() => import("./MapView").then((m) => ({ default: m.MapView })), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-full"
      style={{ backgroundColor: "oklch(0.12 0 0)" }}
    />
  ),
});

export function MapViewLoader(props: React.ComponentProps<typeof MapView>) {
  return <MapView {...props} />;
}
