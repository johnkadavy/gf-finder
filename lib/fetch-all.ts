// PostgREST caps every response at 1,000 rows (max-rows), and a plain select
// past that is silently truncated — no error, no hint. Any query that needs
// every matching row must page through with fetchAllRows.
export const PAGE_SIZE = 1000;

type Pageable = {
  gt(column: "id", value: number): {
    order(column: "id", options: { ascending: boolean }): {
      limit(count: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
};

/**
 * Every row matching the query built by `build` (called once per page; it
 * should apply select + filters only, and the select must include `id`).
 *
 * Pages by keyset (`id > last id`) rather than .range(): an OFFSET page makes
 * Postgres compute the projection for every row before it sorts and skips,
 * which for dossier JSON paths means detoasting the whole table on every page
 * (~0.9s/page vs ~30ms, and it trips the statement timeout).
 *
 * Throws on any page error so callers inside unstable_cache never cache a
 * partial result.
 */
export async function fetchAllRows<T extends { id: number }>(build: () => Pageable): Promise<T[]> {
  const rows: T[] = [];
  let lastId = 0;
  for (;;) {
    const { data, error } = await build()
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (error) throw new Error(`fetchAllRows: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    lastId = page[page.length - 1].id;
    if (typeof lastId !== "number") throw new Error("fetchAllRows: select must include id");
  }
}
