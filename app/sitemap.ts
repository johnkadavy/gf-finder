import { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

const BASE_URL = "https://trycleanplate.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, updated_at")
    .not("score", "is", null);

  const restaurantUrls: MetadataRoute.Sitemap = (restaurants ?? []).map((r) => ({
    url: `${BASE_URL}/restaurant/${r.id}`,
    lastModified: r.updated_at ? new Date(r.updated_at) : new Date(),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [
    {
      url: BASE_URL,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/rankings`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...restaurantUrls,
  ];
}
