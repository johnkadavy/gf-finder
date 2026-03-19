import { supabase } from "@/lib/supabase";

type Restaurant = {
  id: number;
  name: string;
  slug: string;
  city: string;
  neighborhood: string | null;
  cuisine: string | null;
  safety_level: string | null;
  option_abundance: string | null;
  confidence_level: string | null;
  summary: string | null;
};

type HomePageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  let restaurants: Restaurant[] = [];

  if (query) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("published", true)
      .ilike("name", `%${query}%`)
      .order("name");

    if (!error) {
      restaurants = (data ?? []) as Restaurant[];
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <section className="max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight">
          Search gluten-free restaurant assessments
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Look up restaurants in our database and quickly see early signals
          about gluten-free suitability.
        </p>
      </section>

      <section className="mt-10 max-w-3xl">
        <form className="flex gap-3">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search for a restaurant"
            className="w-full rounded-md border px-4 py-3 text-base outline-none focus:ring-2 focus:ring-black"
          />
          <button
            type="submit"
            className="rounded-md bg-black px-5 py-3 text-white"
          >
            Search
          </button>
        </form>
      </section>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Results
        </h2>

        {!query ? (
          <div className="mt-4 rounded-xl border border-dashed p-6 text-gray-600">
            Search for a restaurant to get started.
          </div>
        ) : restaurants.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed p-6 text-gray-600">
            No matching restaurants found.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {restaurants.map((restaurant) => (
              <div key={restaurant.id} className="rounded-xl border p-5">
                <h3 className="text-xl font-semibold">{restaurant.name}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {[restaurant.neighborhood, restaurant.city, restaurant.cuisine]
                    .filter(Boolean)
                    .join(" • ")}
                </p>

                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  {restaurant.safety_level && (
                    <span className="rounded-full border px-2 py-1">
                      Safety: {restaurant.safety_level}
                    </span>
                  )}
                  {restaurant.option_abundance && (
                    <span className="rounded-full border px-2 py-1">
                      Options: {restaurant.option_abundance}
                    </span>
                  )}
                  {restaurant.confidence_level && (
                    <span className="rounded-full border px-2 py-1">
                      Confidence: {restaurant.confidence_level}
                    </span>
                  )}
                </div>

                {restaurant.summary && (
                  <p className="mt-3 text-gray-700">{restaurant.summary}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}