import { entityDisplayLabel } from "./vocab";

export interface EntityTitleRow {
  id: string;
  name: string;
  slug?: string | null;
}

export interface EntitySearchRow extends EntityTitleRow {
  summary?: string | null;
  notes?: string | null;
}

/** Id → display label for job-input subjects and search. */
export function entityTitleMapFromRows(
  rows: readonly EntityTitleRow[],
  neededIds?: ReadonlySet<string>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (neededIds !== undefined && !neededIds.has(row.id)) continue;
    const label = entityDisplayLabel({
      name: row.name,
      slug: row.slug ?? "",
    });
    if (label !== "") {
      map.set(row.id, label);
    }
  }
  return map;
}

/** Search haystack for entity-linked queue rows (label, slug, summary, notes). */
export function entitySearchHaystackFromRow(row: EntitySearchRow): string {
  const label = entityDisplayLabel({
    name: row.name,
    slug: row.slug ?? "",
  });
  const slug = (row.slug ?? "").trim();
  const summary = row.summary?.trim() ?? "";
  const notes = row.notes?.trim() ?? "";
  return [label, slug, summary, notes].filter((part) => part !== "").join(" ");
}

export function entitySearchHaystackMapFromRows(
  rows: readonly EntitySearchRow[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.id, entitySearchHaystackFromRow(row));
  }
  return map;
}
