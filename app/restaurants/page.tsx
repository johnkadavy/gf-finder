export default function HomePage() {
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
        <div className="mt-4 rounded-xl border border-dashed p-6 text-gray-600">
          Search for a restaurant to get started.
        </div>
      </section>
    </main>
  );
}