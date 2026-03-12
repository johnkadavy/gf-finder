import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Gluten-Free Finder</h1>
      <p className="mt-4 text-lg text-gray-600">
        Find restaurants with clearer gluten-free safety signals.
      </p>

      <div className="mt-8">
        <Link
          href="/restaurants"
          className="rounded-md bg-black px-4 py-2 text-white"
        >
          Browse restaurants
        </Link>
      </div>
    </main>
  );
}