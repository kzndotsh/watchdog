import { z } from "zod";

import { CURSOR_MAX } from "./limits";

/** Items one page returns when the caller sends no `limit`. */
export const PAGE_LIMIT_DEFAULT = 50;

/** Most items one page returns: a larger `limit` is a validation error, not a silent cut. */
export const PAGE_LIMIT_MAX = 200;

/**
 * The input every list procedure takes: an opaque `cursor` (the previous page's `nextCursor`;
 * omit it for the first page) and a page size. Extend a list's input schema with these fields.
 */
export const pageInputFields = {
  cursor: z.string().trim().min(1).max(CURSOR_MAX).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(PAGE_LIMIT_MAX)
    .default(PAGE_LIMIT_DEFAULT),
};

/** The page object, as a zod shape, for an item schema. `nextCursor` is null on the last page. */
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item).max(PAGE_LIMIT_MAX),
    /** Pass as `cursor` for the next page; null on the last page. */
    nextCursor: z.string().nullable(),
  });
}

/** One page of a list: the items in stable order and the cursor of the next page. */
export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

/** Most Caps the registry output may carry: the registry is fixed at build time (about sixty). */
export const CAPABILITY_LIST_MAX = 500;
/** Most playbooks the registry output may carry (a handful, fixed at build time). */
export const PLAYBOOK_LIST_MAX = 100;
/** Most credential slots one answer may carry: one per credential name the Caps declare. */
export const CREDENTIAL_SLOT_LIST_MAX = 500;

/**
 * A list that is never paged because it is bounded by something other than data: the registry, or
 * the ids the caller sent. The maximum is part of the schema (it is in the OpenAPI document and
 * the server rejects an answer past it), so a bounded list cannot grow into an unpaged one.
 */
export function boundedListSchema<T extends z.ZodType>(item: T, max: number) {
  return z.array(item).max(max);
}
