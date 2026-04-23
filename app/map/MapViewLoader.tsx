"use client";

import dynamic from "next/dynamic";

// Dynamic import with ssr:false must live in a Client Component
const MapView = dynamic(() => import("./MapView").then((m) => ({ default: m.MapView })), {
  ssr: false,
});

export function MapViewLoader(props: React.ComponentProps<typeof MapView>) {
  return <MapView {...props} />;
}
