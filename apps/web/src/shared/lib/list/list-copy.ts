import type {
  AnyFilter,
  AnyListDef,
  ListKeyType,
  SortDir,
} from "@watchdog/schemas/shared";

import type { ListCountValue } from "./list-types";

/**
 * The only list copy web adds to a declaration's labels. Direction words come from the sort
 * key's TYPE, so no list declares "Newest first".
 */
const DIRECTION_WORDS: Readonly<
  Record<ListKeyType, Readonly<Record<SortDir, string>>>
> = {
  time: { desc: "Newest", asc: "Oldest" },
  text: { asc: "A–Z", desc: "Z–A" },
  int: { asc: "Lowest", desc: "Highest" },
};

export function sortDirectionLabel(type: ListKeyType, dir: SortDir): string {
  return DIRECTION_WORDS[type][dir];
}

/** "Captured, Newest" for the Display options Sort list; an undeclared value reads as itself. */
export function sortOptionLabel(def: AnyListDef, value: string): string {
  const at = value.lastIndexOf(".");
  const sort = def.sorts[value.slice(0, at)];
  const dir = value.slice(at + 1);
  if (sort === undefined || (dir !== "asc" && dir !== "desc")) return value;
  return `${sort.label}, ${sortDirectionLabel(sort.type, dir)}`;
}

/** Fixed locale: the server HTML and the first client render must print the same digits. */
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

/** "12", "1,000+": the total when known, else the loaded rows with "+" while more remain. */
export function compactCountLabel(count: ListCountValue): string {
  if (count.total !== null) {
    const text = NUMBER_FORMAT.format(count.total.count);
    return count.total.isCapped ? `${text}+` : text;
  }
  const loaded = NUMBER_FORMAT.format(count.loaded);
  return count.hasMore ? `${loaded}+` : loaded;
}

/** "Showing 50 of 1,000+", "Showing 12". */
export function fullCountLabel(count: ListCountValue): string {
  const loaded = NUMBER_FORMAT.format(count.loaded);
  const of = compactCountLabel(count);
  return of === loaded ? `Showing ${loaded}` : `Showing ${loaded} of ${of}`;
}

/** The footer's line at the `LIST_MAX_PAGES` ceiling. */
export const LIST_CEILING_HINT = "Narrow the filters to see more.";

/** What the polite live region says once a view settles: "1,000+ evidence", "1 identifier". */
export function countAnnouncement(
  count: ListCountValue,
  noun: { readonly one: string; readonly many: string }
): string {
  const text = compactCountLabel(count);
  return `${text} ${text === "1" ? noun.one : noun.many}`;
}

/** A chip or row value: "url, file", "Acme Ltd", "" for a flag (its label says it all). */
export function filterValueLabel(
  filter: AnyFilter,
  value: unknown,
  refTitle: string | null
): string {
  switch (filter.kind) {
    case "flag": {
      return "";
    }
    case "choices": {
      const labels: Readonly<Record<string, string>> = filter.optionLabels;
      return Array.isArray(value)
        ? value.map((item) => labels[String(item)] ?? String(item)).join(", ")
        : "";
    }
    case "tags": {
      return Array.isArray(value) ? value.map(String).join(", ") : "";
    }
    case "ref": {
      // Never the uuid: the title, or an ellipsis while the get-by-ids read is in flight.
      return refTitle ?? "…";
    }
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

/** "Kind: url, file", "Hidden", "Entity: Acme Ltd". */
export function filterChipLabel(
  filter: AnyFilter,
  value: unknown,
  refTitle: string | null
): string {
  const text = filterValueLabel(filter, value, refTitle);
  return text === "" ? filter.label : `${filter.label}: ${text}`;
}
