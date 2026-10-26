import { createHash } from "node:crypto";

import { Effect } from "effect";

import type { ListAfter } from "@watchdog/db";
import { CURSOR_MAX, URL_MAX } from "@watchdog/schemas/shared";
import type { ListKeyType } from "@watchdog/schemas/shared";

import { InvalidError, StaleCursorError } from "./tagged-errors";

/**
 * Cursor v2, for declared lists (ADR-0007). A cursor names the VIEW it was issued for, not only
 * the list:
 *
 *   base64url(JSON [list, sort, fingerprint, id, value])
 *
 * `sort` is the sort value (`captured.desc`); `fingerprint` is the first 12 hex characters of
 * sha256 over the scope key, a newline and `def.keyOf(query)` (sort, `q` and the canonical
 * filters). `value` is the row's sort key (microsecond ISO text for a time key). Two distinct
 * refusals, told apart by code, never by message:
 * - `InvalidError` (400, `invalid`): not a cursor at all, or another list's.
 * - `StaleCursorError` (400, `cursor_stale`): this list's cursor, issued for another sort, filter
 *   set, search or scope. A client resets the view to its first page on this code.
 * The fingerprint is a misuse check, not a secret: the query still applies the scope.
 * Legacy (undeclared) lists keep cursor v1 (`page.ts`) until they move.
 */

/** One view's cursors: built by `listPageSpec`, never by hand. */
export type ListCursorSpec = {
  readonly list: string;
  readonly sort: string;
  readonly fingerprint: string;
  readonly key: ListKeyType;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_MICROS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/** sha256 of the text, first 12 hex characters. The same view always gives the same fingerprint. */
export function fingerprintOf(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex").slice(0, 12);
}

export function encodeListCursor(
  spec: ListCursorSpec,
  after: ListAfter
): string {
  const json = JSON.stringify([
    spec.list,
    spec.sort,
    spec.fingerprint,
    after.id,
    after.value,
  ]);
  return Buffer.from(json, "utf-8").toString("base64url");
}

/**
 * A real instant Postgres accepts: the ISO shape, a year from 0001 (Postgres has no year 0), and
 * a date and time that survive a round trip through `Date` (`2026-13-45` does not). The
 * microseconds are past `Date`'s precision and only shape-checked.
 */
function validTime(value: string): boolean {
  if (!ISO_MICROS.test(value) || value.startsWith("0000")) return false;
  const millis = `${value.slice(0, 23)}Z`;
  const parsed = new Date(millis);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === millis;
}

/**
 * Text a sort key can hold: no NUL (Postgres text cannot store one) and no longer than the
 * longest sortable text (`URL_MAX`).
 */
function validText(value: string): boolean {
  return value.length <= URL_MAX && !value.includes("\u0000");
}

/** A cursor value the database accepts for this key type; anything else is `invalid`, never a 500. */
function validValue(
  type: ListKeyType,
  value: unknown
): value is string | number {
  if (type === "time") return typeof value === "string" && validTime(value);
  if (type === "int") {
    return typeof value === "number" && Number.isSafeInteger(value);
  }
  return typeof value === "string" && validText(value);
}

function parts(raw: string): unknown[] | null {
  if (raw.length > CURSOR_MAX) return null;
  try {
    const json: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf-8")
    );
    return Array.isArray(json) ? json : null;
  } catch {
    return null;
  }
}

/** Where a page of the view starts: `undefined` for the first page. */
export function decodeListCursor(
  raw: string | undefined,
  spec: ListCursorSpec
): Effect.Effect<ListAfter | undefined, InvalidError | StaleCursorError> {
  return Effect.gen(function* decodeListCursorGen() {
    if (raw === undefined) return;
    const invalid = new InvalidError({ reason: "Invalid cursor" });
    const json = parts(raw);
    if (json?.length !== 5) return yield* invalid;
    const [list, sort, fingerprint, id, value] = json;
    if (
      list !== spec.list ||
      typeof sort !== "string" ||
      typeof fingerprint !== "string"
    ) {
      return yield* invalid;
    }
    if (sort !== spec.sort || fingerprint !== spec.fingerprint) {
      return yield* new StaleCursorError({ list: spec.list });
    }
    if (typeof id !== "string" || !UUID.test(id)) return yield* invalid;
    if (!validValue(spec.key, value)) return yield* invalid;
    return { id, value };
  });
}

/** The cursor after the last of the first `limit` rows, or null when no row was left over. */
export function nextListCursor(
  rows: readonly { readonly id: string; readonly listKey: string | number }[],
  limit: number,
  spec: ListCursorSpec
): string | null {
  const last = rows.slice(0, limit).at(-1);
  return rows.length > limit && last !== undefined
    ? encodeListCursor(spec, { id: last.id, value: last.listKey })
    : null;
}
