import { Effect } from "effect";

import type { KeysetAfter } from "@watchdog/db";
import {
  CURSOR_MAX,
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
  URL_MAX,
} from "@watchdog/schemas/shared";

import { InvalidError } from "./tagged-errors";

/**
 * Cursor pagination for list services. A list orders by sort columns and then the row id (a
 * total order), asks its repo for `limit + 1` rows after the cursor's key, and answers a
 * {@link Page}: the first `limit` rows and, when a row was left over, the cursor of the last
 * one. The cursor is opaque to callers (base64url of `[list, id, ...sort-key values]`) and
 * names its list and the type of every part, so a cursor from another list, or a malformed one,
 * is a 400 here and never reaches the database (where it would be a 500). The repo side is
 * `keysetAfter` in `@watchdog/db`.
 */

export type PageRequest = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
};

/** What a sort-key value is: free text, a timestamp as ISO text (`keyTime`), or an integer. */
export type CursorKeyType = "text" | "time" | "int";

/** The shape of one list's cursors. */
export type PageSpec = {
  /** The list's name, written into its cursors. */
  readonly list: string;
  /** The row id: a uuid (default) or an integer. */
  readonly id?: "uuid" | "int";
  /** The sort-key values before the id, in order. */
  readonly keys: readonly CursorKeyType[];
};

/** What a repo needs to fetch a page: one more row than `limit`, and where to start. */
export type PageWindow = {
  readonly list: string;
  readonly limit: number;
  readonly after: KeysetAfter | undefined;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_TEXT = /^\d{1,18}$/;
const ISO_MICROS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/** The opaque cursor of a row: its list, id and the values of the list's sort columns. */
export function encodeCursor(list: string, key: KeysetAfter): string {
  const json = JSON.stringify([list, key.id, ...key.values]);
  return Buffer.from(json, "utf-8").toString("base64url");
}

function validValue(
  type: CursorKeyType,
  value: unknown
): value is string | number {
  if (type === "text") {
    return typeof value === "string" && value.length <= URL_MAX;
  }
  if (type === "time") {
    return typeof value === "string" && ISO_MICROS.test(value);
  }
  return typeof value === "number" && Number.isSafeInteger(value);
}

function decodeCursor(raw: string, spec: PageSpec): KeysetAfter | null {
  if (raw.length > CURSOR_MAX) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (!Array.isArray(json) || json.length !== spec.keys.length + 2) return null;
  const parts: unknown[] = json;
  const [list, id, ...values] = parts;
  if (list !== spec.list || typeof id !== "string") return null;
  if (!(spec.id === "int" ? INT_TEXT : UUID).test(id)) return null;
  const parsed: (string | number)[] = [];
  for (const [index, value] of values.entries()) {
    const type = spec.keys[index];
    if (type === undefined || !validValue(type, value)) return null;
    parsed.push(value);
  }
  return { id, values: parsed };
}

/**
 * The window of a page request: the size (the default when absent, never above
 * `PAGE_LIMIT_MAX`) and the decoded cursor, checked against the list's {@link PageSpec}
 * (`InvalidError` for a cursor that is not one of this list's).
 */
export function pageWindow(
  request: PageRequest,
  spec: PageSpec
): Effect.Effect<PageWindow, InvalidError> {
  return Effect.gen(function* pageWindowGen() {
    const limit = Math.min(
      Math.max(1, Math.trunc(request.limit ?? PAGE_LIMIT_DEFAULT)),
      PAGE_LIMIT_MAX
    );
    if (request.cursor === undefined) {
      return { list: spec.list, limit, after: undefined };
    }
    const after = decodeCursor(request.cursor, spec);
    if (after === null) {
      return yield* new InvalidError({ reason: "Invalid cursor" });
    }
    return { list: spec.list, limit, after };
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
    ? encodeCursor(window.list, keyOf(last))
    : null;
}
