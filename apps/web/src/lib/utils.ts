import { slugifyName as schemaSlugifyName } from "@watchdog/schemas/shared";

export { cn } from "cn";

export function slugifyName(name: string): string {
  return schemaSlugifyName(name);
}

/** Keep slug in lockstep with name until the user edits it. */
export function nextAutoSlug(
  previousName: string,
  previousSlug: string,
  nextName: string
): string | null {
  const stillAuto = !previousSlug || previousSlug === slugifyName(previousName);
  return stillAuto ? slugifyName(nextName) : null;
}

/**
 * The first string with visible characters, or `undefined` if none. Use it for display
 * fallbacks: unlike `??` it skips `""` (an unnamed API key, an empty IP), and unlike `||`
 * it is explicit about strings only.
 */
export function firstNonEmpty(
  ...values: readonly (string | null | undefined)[]
): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.trim() !== ""
  );
}

/** A Better Auth / fetch error message, or `fallback` when it is missing or empty. */
export function messageOr(
  message: string | null | undefined,
  fallback: string
): string {
  return message === undefined || message === null || message === ""
    ? fallback
    : message;
}

/** Fixed client message the API sends for every `InternalError` (500). */
const SERVER_FAILURE_MESSAGE = "Internal server error";

/**
 * True for an oRPC `INTERNAL_SERVER_ERROR` / HTTP 500. Duck-typed because the
 * error can cross a server-function boundary and lose its `ORPCError` class;
 * the API's fixed 500 message is the last-resort signal.
 */
export function isServerFailure(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const { code, status, message } = err as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };
  return (
    code === "INTERNAL_SERVER_ERROR" ||
    status === 500 ||
    message === SERVER_FAILURE_MESSAGE
  );
}

/** House copy for a failed server action: names the action, then `Try again.` */
export function serverFailureMessage(action: string): string {
  return `${action.replace(/[.\s]+$/, "")}. Try again.`;
}

/**
 * User-visible text for an error. A server failure (500) never shows the raw
 * message; it reads `<fallback>. Try again.` (e.g. "Couldn't save claim. Try again.").
 */
export function errMessage(err: unknown, fallback: string): string {
  if (isServerFailure(err)) return serverFailureMessage(fallback);
  return err instanceof Error ? err.message : fallback;
}
