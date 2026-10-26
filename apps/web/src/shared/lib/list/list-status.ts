import type { ListStatus } from "./list-types";

/** Stable `data.code` the API sends for a list cursor issued for another view (ADR-0007). */
const STALE_CURSOR_CODE = "cursor_stale";

/** The tail of `StaleCursorError`'s message: the signal left when a ServerFn drops `data`. */
const STALE_CURSOR_MESSAGE_TAIL = "start again from the first page";

/**
 * True for the API's `cursor_stale` 400. Duck-typed like `isStaleVersionError`: the error can
 * cross a server-function boundary and lose its `ORPCError` class and `data`.
 */
export function isStaleCursorError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const data: unknown = Reflect.get(err, "data");
  if (
    typeof data === "object" &&
    data !== null &&
    Reflect.get(data, "code") === STALE_CURSOR_CODE
  ) {
    return true;
  }
  const message: unknown = Reflect.get(err, "message");
  return (
    typeof message === "string" && message.endsWith(STALE_CURSOR_MESSAGE_TAIL)
  );
}

export type ListStatusInput = {
  /** Nothing of this view (or a previous one) to show yet: `listPending` of the query. */
  readonly isPending: boolean;
  /** The view's query is in error and has no rows of its own. */
  readonly isFailed: boolean;
  readonly rowCount: number;
  readonly isFiltered: boolean;
};

/** The one place the order of the list states lives (loading.md rule 5). */
export function listStatus(input: ListStatusInput): ListStatus {
  if (input.isPending) return "pending";
  if (input.isFailed) return "error";
  if (input.rowCount > 0) return "ready";
  // Never "No evidence yet" while something is filtered or searched.
  return input.isFiltered ? "no-match" : "blank";
}
