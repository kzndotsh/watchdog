import { Effect } from "effect";
import { z } from "zod";

import type { KeysetAfter } from "@watchdog/db";
import {
  NAME_MAX,
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
} from "@watchdog/schemas/shared";
import type { Page } from "@watchdog/schemas/shared";

import { InvalidError } from "./tagged-errors";

/**
 * Cursor pagination for list services. A list orders by sort columns and then the row id (a
 * total order), asks its repo for `limit + 1` rows after the cursor's key, and answers a
 * {@link Page}: the first `limit` rows and, when a row was left over, the cursor of the last
 * one. The cursor is opaque to callers (base64url of `[id, ...sort-key values]`); a malformed
 * or foreign one is a 400, never a guess. The repo side is `keysetAfter` in `@watchdog/db`.
 */

export type PageRequest = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
};

/** What a repo needs to fetch a page: one more row than `limit`, and where to start. */
export type PageWindow = {
  readonly limit: number;
  readonly after: KeysetAfter | undefined;
};

const cursorPartsSchema = z
  .array(z.union([z.string().max(NAME_MAX), z.number()]))
  .min(1)
  .max(6);

/** The opaque cursor of a row: its id and the values of the list's sort columns. */
export function encodeCursor(key: KeysetAfter): string {
  const json = JSON.stringify([key.id, ...key.values]);
  return Buffer.from(json, "utf-8").toString("base64url");
}

function decodeCursor(raw: string, keyCount: number): KeysetAfter | null {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  const parts = cursorPartsSchema.safeParse(json);
  if (!parts.success) return null;
  const [id, ...values] = parts.data;
  if (typeof id !== "string" || values.length !== keyCount) return null;
  return { id, values };
}

/**
 * The window of a page request: the size (the default when absent, never above
 * `PAGE_LIMIT_MAX`) and the decoded cursor. `keyCount` is how many sort columns the list has
 * before the id; a cursor from another list does not fit and is `InvalidError`.
 */
export function pageWindow(
  request: PageRequest,
  keyCount: number
): Effect.Effect<PageWindow, InvalidError> {
  return Effect.gen(function* pageWindowGen() {
    const limit = Math.min(
      Math.max(1, Math.trunc(request.limit ?? PAGE_LIMIT_DEFAULT)),
      PAGE_LIMIT_MAX
    );
    if (request.cursor === undefined) return { limit, after: undefined };
    const after = decodeCursor(request.cursor, keyCount);
    if (after === null) {
      return yield* new InvalidError({ reason: "Invalid cursor" });
    }
    return { limit, after };
  });
}

/** The cursor of the page ending at the last of the first `limit` rows, or null on the last page. */
export function nextCursorOf<Row>(
  rows: readonly Row[],
  window: PageWindow,
  keyOf: (row: Row) => KeysetAfter
): string | null {
  const last = rows.slice(0, window.limit).at(-1);
  return rows.length > window.limit && last !== undefined
    ? encodeCursor(keyOf(last))
    : null;
}

/**
 * Rows fetched as `limit + 1` (`window.limit + 1` passed to the repo) to a {@link Page}:
 * the first `limit` mapped, and a cursor built from the last of them when more remain.
 */
export function toPage<Row, Item>(
  rows: readonly Row[],
  window: PageWindow,
  toItem: (row: Row) => Item,
  keyOf: (row: Row) => KeysetAfter
): Page<Item> {
  return {
    items: rows.slice(0, window.limit).map(toItem),
    nextCursor: nextCursorOf(rows, window, keyOf),
  };
}
