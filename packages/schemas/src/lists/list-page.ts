import { z } from "zod";

import { NAME_MAX } from "../limits";
import { pageSchema } from "../pagination";
import type { Page } from "../pagination";

/**
 * The output of a declared list (ADR-0007): `{ items, nextCursor }` plus `total`, a capped count
 * of the whole filtered set, sent on the FIRST page only (no cursor) and null on later pages.
 * A `ListPage<T>` is a `Page<T>`, so `Page<T>` callers (the CLI's `--all`) keep compiling.
 */

/** "1,000+" above this. A list overrides it in its declaration only with a measured reason. */
export const LIST_TOTAL_CAP = 1000;

/**
 * Pages one view may load (10 × 50 = 500 rows). At the ceiling the footer asks to narrow the
 * filters instead of offering Load more. It bounds what a refresh re-walks after a live update
 * and the DOM without virtualization.
 */
export const LIST_MAX_PAGES = 10;

/**
 * Shortest list `q`: a trigram index cannot serve a pattern under 3 characters. The wire rejects
 * a trimmed `q` of 1 or 2 characters; the URL drops it quietly. The command palette keeps
 * `SEARCH_MIN_QUERY_LENGTH` (2).
 */
export const LIST_SEARCH_MIN_LENGTH = 3;

/**
 * A list's `q` on the wire: a trimmed `q` of 1 or 2 characters is a 400, never silently dropped.
 * Every declared list's `input` uses it, and so does a capped read that takes a list's search
 * (`tasks.board`).
 */
export const listSearchWireSchema = z
  .string()
  .trim()
  .max(NAME_MAX)
  .refine((q) => q === "" || q.length >= LIST_SEARCH_MIN_LENGTH, {
    message: `Search needs at least ${LIST_SEARCH_MIN_LENGTH} characters`,
  })
  .optional();

export const listTotalSchema = z.object({
  /** Exact when `isCapped` is false; equals the cap when true. */
  count: z.number().int().min(0),
  isCapped: z.boolean(),
});

export type ListTotal = z.output<typeof listTotalSchema>;

export function listPageSchema<T extends z.ZodType>(item: T) {
  return pageSchema(item).extend({
    /** Matching rows, capped: on the first page only, null after. */
    total: listTotalSchema.nullable(),
  });
}

export type ListPage<T> = Page<T> & { readonly total: ListTotal | null };
