"use client";

import dynamic from "next/dynamic";
import type { MapRestaurant } from "../types";

const SharedMapView = dynamic(
  () => import("./SharedMapView").then((m) => ({ default: m.SharedMapView })),
  { ssr: false }
);

export function SharedMapViewLoader(props: React.ComponentProps<typeof SharedMapView>) {
  return <SharedMapView {...props} />;
}
