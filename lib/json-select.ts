/**
 * Select only the JSON fields a list needs instead of the whole `dossier`
 * blob. Full dossiers made list queries (sorted by score) spill
 * to disk as temp I/O; a handful of scalar paths keeps rows small.
 *
 *   .select(`id, name, ${selectJsonPaths("dossier", LIST_DOSSIER_PATHS)}`)
 *   const rows = nestJsonPaths(data, { dossier: LIST_DOSSIER_PATHS })
 *
 * nestJsonPaths rebuilds the nested shape (`row.dossier.menu.gf_labeling`), so
 * consumers keep reading the same fields. Uses `->` (not `->>`) so booleans
 * and numbers keep their JSON types.
 */

export type JsonPath = readonly string[];
type JsonColumn = "dossier";

const alias = (column: JsonColumn, path: JsonPath) => `${column}__${path.join("__")}`;

export function selectJsonPaths(column: JsonColumn, paths: readonly JsonPath[]): string {
  return paths.map((p) => `${alias(column, p)}:${column}->${p.join("->")}`).join(", ");
}

export function nestJsonPaths<T>(
  rows: Record<string, unknown>[] | null | undefined,
  spec: Partial<Record<JsonColumn, readonly JsonPath[]>>,
): T[] {
  return (rows ?? []).map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const [column, paths] of Object.entries(spec) as [JsonColumn, readonly JsonPath[]][]) {
      let obj: Record<string, unknown> | null = null;
      for (const path of paths) {
        const key = alias(column, path);
        const value = out[key];
        delete out[key];
        if (value === null || value === undefined) continue;
        obj ??= {};
        let node = obj;
        for (const segment of path.slice(0, -1)) {
          node = (node[segment] ??= {}) as Record<string, unknown>;
        }
        node[path[path.length - 1]] = value;
      }
      out[column] = obj;
    }
    return out as T;
  });
}

// ── Shared path sets ────────────────────────────────────────────────────────

/** Ranked lists (RankedList row + highlights + landing quick filters). */
export const LIST_DOSSIER_PATHS = [
  ["summary", "short_summary"],
  ["operations", "dedicated_equipment", "fryer"],
  ["operations", "cross_contamination_risk"],
  ["menu", "gf_labeling"],
] as const satisfies readonly JsonPath[];

export const LIST_JSON_SELECT = selectJsonPaths("dossier", LIST_DOSSIER_PATHS);

export const LIST_JSON_SPEC = { dossier: LIST_DOSSIER_PATHS };
