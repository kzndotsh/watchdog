import { STALE_VERSION_MESSAGE_SUFFIX } from "@watchdog/schemas/shared";

/** Stable `data.code` the API sends when an edit named an out-of-date row version (#307). */
const STALE_VERSION_CODE = "stale_version";

function readProp(obj: object, key: string): unknown {
  return Reflect.get(obj, key);
}

/**
 * True when an edit lost to another writer: the API's `stale_version` conflict. Duck-typed like
 * `isServerFailure`: the error can cross a server-function boundary and lose its `ORPCError`
 * class and `data`, so the fixed message tail (`<Entity> changed since you opened it`) is the
 * fallback signal.
 */
export function isStaleVersionError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const data = readProp(err, "data");
  if (
    typeof data === "object" &&
    data !== null &&
    readProp(data, "code") === STALE_VERSION_CODE
  ) {
    return true;
  }
  const message = readProp(err, "message");
  return (
    typeof message === "string" &&
    message.endsWith(STALE_VERSION_MESSAGE_SUFFIX)
  );
}

/** House copy for a stale edit: names the thing, then says what happened. */
export function staleVersionMessage(noun: string): string {
  return `This ${noun} ${STALE_VERSION_MESSAGE_SUFFIX}.`;
}
