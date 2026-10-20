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
