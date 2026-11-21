import { parseOptionalTrimmedUuid } from "@watchdog/schemas/shared";

/**
 * The Active Case is the URL's Case (`/cases/$caseSlug/...`). A screen whose URL names no Case
 * (Dashboard, Library, the palette) defaults to the last Case this browser entered, kept in
 * `localStorage` (per browser profile, never sent to the server), else the first visible Case.
 * Shaped for `useSyncExternalStore`: the server snapshot is `null`, so a server render and the
 * first client render agree, then the client reads its own value.
 */
export const LAST_CASE_STORAGE_KEY = "watchdog.last-case-id";

/** Fired after a Case is created, renamed, deleted or restored (client UI refresh). */
export const CASES_CHANGED_EVENT = "watchdog:cases-changed";

const listeners = new Set<() => void>();

/** The unsubscribe of a server-side subscribe, which has nothing to listen to. */
const noop = (): void => undefined;

/** What this tab last wrote, for when storage is unavailable (private mode, blocked site data). */
let fallback: string | null = null;

/** The last Case this browser entered; `null` on the server or before any. */
export function readLastCaseId(): string | null {
  if (typeof window === "undefined") return null;
  let stored = fallback;
  try {
    stored = window.localStorage.getItem(LAST_CASE_STORAGE_KEY);
  } catch {
    // Storage is blocked: this tab's own memory answers.
  }
  return parseOptionalTrimmedUuid(stored ?? undefined) ?? null;
}

/** Server renders have no storage. */
export function readServerLastCaseId(): null {
  return null;
}

/** Notifies on this tab's changes and on other tabs' `storage` events. */
// oxlint-disable-next-line promise/prefer-await-to-callbacks -- useSyncExternalStore subscribe contract requires a sync callback
export function subscribeToLastCase(callback: () => void): () => void {
  if (typeof window === "undefined") return noop;
  window.addEventListener("storage", callback);
  listeners.add(callback);
  return () => {
    window.removeEventListener("storage", callback);
    listeners.delete(callback);
  };
}

/**
 * Remember `caseId` as the last Case entered (a Case route, a switch, a new Case).
 *
 * @canonical `rememberLastCase`, `readLastCaseId`, `pickDefaultCase`: The Active Case of a screen whose URL names no Case: the last Case this browser entered (`localStorage`, never a cookie or server state), else the first visible one
 */
export function rememberLastCase(caseId: string): void {
  if (typeof window === "undefined" || readLastCaseId() === caseId) return;
  fallback = caseId;
  try {
    window.localStorage.setItem(LAST_CASE_STORAGE_KEY, caseId);
  } catch {
    // Kept in memory for this tab.
  }
  for (const listener of listeners) listener();
}

/** The default Case of a Case-less screen: the last one entered while still visible, else the first. */
export function pickDefaultCase<T extends { id: string }>(
  cases: readonly T[],
  lastCaseId: string | null
): T | null {
  return (
    (lastCaseId === null
      ? undefined
      : cases.find((row) => row.id === lastCaseId)) ??
    cases[0] ??
    null
  );
}

export function notifyCasesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CASES_CHANGED_EVENT));
}
