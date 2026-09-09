import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Permanent redirects for restaurants whose slug was regenerated to drop the
  // old manual-add Google place_id suffix (e.g. "-6nyw-o") in favor of the
  // canonical name-neighborhood scheme used by the ingest pipeline. Preserves
  // indexed/bookmarked/backlinked URLs for these restaurants.
  async redirects() {
    return [
      { source: "/restaurant/double-zero-new-york-1y9ofc", destination: "/restaurant/double-zero-nolita", permanent: true },
      { source: "/restaurant/rosecrans-florist-caf-new-york-h9v3lu", destination: "/restaurant/rosecrans-florist-and-caf-west-village", permanent: true },
      { source: "/restaurant/nappi-s-nook-nesconset-slexwm", destination: "/restaurant/nappis-nook-nesconset", permanent: true },
      { source: "/restaurant/sigiri-new-york-nwytmg", destination: "/restaurant/sigiri-east-village", permanent: true },
      { source: "/restaurant/casa-piada-new-york-wxico4", destination: "/restaurant/casa-piada-west-village", permanent: true },
      { source: "/restaurant/cleo-downtown-new-york-atg9wm", destination: "/restaurant/cleo-downtown-west-village", permanent: true },
      { source: "/restaurant/baldanza-bros-huntington-l6logm", destination: "/restaurant/baldanza-bros-huntington", permanent: true },
      { source: "/restaurant/fulton-hall-new-york-wwdecq", destination: "/restaurant/fulton-hall-fort-greene", permanent: true },
      { source: "/restaurant/bohemian-hall-beer-garden-new-york-hab10e", destination: "/restaurant/bohemian-hall-and-beer-garden-astoria", permanent: true },
      { source: "/restaurant/tom-and-jerry-s-new-york-bdvgdy", destination: "/restaurant/tom-and-jerrys-nolita", permanent: true },
      { source: "/restaurant/myka-greek-frozen-yogurt-new-york-6nyw-o", destination: "/restaurant/myka-greek-frozen-yogurt-west-village", permanent: true },
      { source: "/restaurant/by-the-way-bakery-new-york-zqfjss", destination: "/restaurant/by-the-way-bakery-carnegie-hill", permanent: true },
      { source: "/restaurant/the-canuck-new-york-qksm9w", destination: "/restaurant/the-canuck-chelsea", permanent: true },
      { source: "/restaurant/serafina-meatpacking-new-york-o1fefq", destination: "/restaurant/serafina-meatpacking-west-village", permanent: true },
    ];
  },
};

export default nextConfig;
