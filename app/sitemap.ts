import { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

const BASE_URL = "https://trycleanplate.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await supabase
    .from("restaurants")
    .select("id, updated_at")
    .not("score", "is", null)
    .order("id", { ascending: true });

  const restaurantUrls: MetadataRoute.Sitemap = (data ?? []).map((r) => ({
    url: `${BASE_URL}/restaurant/${r.id}`,
    lastModified: r.updated_at ? new Date(r.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [
    { url: BASE_URL,               lastModified: new Date(), changeFrequency: "daily",   priority: 1.0 },
    { url: `${BASE_URL}/rankings`, lastModified: new Date(), changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE_URL}/map`,      lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE_URL}/about`,    lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    ...restaurantUrls,
  ];
}
