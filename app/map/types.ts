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
  score: number | null;
  color: string;
  scoreLabel: string;
};
