"use client";

import { useState } from "react";

export default function TestPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);

  const handleSearch = async () => {
    const res = await fetch("/api/generate-dossier", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ restaurantName: query }),
    });

    const data = await res.json();
    setResult(data.dossier);
  };

  return (
    <main className="p-10">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Enter restaurant"
        className="border px-3 py-2"
      />

      <button onClick={handleSearch} className="ml-2 bg-black text-white px-3 py-2">
        Search
      </button>

      {result && (
        <pre className="mt-6 text-sm">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}