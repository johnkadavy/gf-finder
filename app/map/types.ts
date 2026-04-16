type OpeningPeriod = {
  open: { day: number; hour: number; minute: number };
  close: { day: number; hour: number; minute: number };
};

export type MapRestaurant = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
  lat: number;
  lng: number;
  cuisine: string | null;
  google_rating: number | null;
  price_level: number | null;
  address: string | null;
  website: string | null;
  google_maps_url: string | null;
  score: number | null;
  color: string;
  scoreLabel: string;
  periods: OpeningPeriod[] | null;
  short_summary: string | null;
  source: string | null;
  ingested_at: string | null;
};

/** Returns true if open, false if closed, null if no hours data. */
export function isOpenNow(periods: OpeningPeriod[] | null): boolean | null {
  if (!periods || periods.length === 0) return null;
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const mins = now.getHours() * 60 + now.getMinutes();
  return periods.some((p) => {
    const openMins = p.open.hour * 60 + p.open.minute;
    const closeMins = p.close.hour * 60 + p.close.minute;
    if (p.open.day === p.close.day) {
      return day === p.open.day && mins >= openMins && mins < closeMins;
    }
    // Spans midnight
    if (day === p.open.day) return mins >= openMins;
    if (day === p.close.day) return mins < closeMins;
    return false;
  });
}
