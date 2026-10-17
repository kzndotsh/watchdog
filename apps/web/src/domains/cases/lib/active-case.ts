/**
 * The Active Case cookie remembers the last Case entered: the default for screens whose
 * URL names no Case. A Case route (`/cases/$caseSlug/...`) names its Case in the URL.
 */

/** Cookie name — httpOnly; read/write via server fns. */
export const ACTIVE_CASE_COOKIE = "watchdog.active-case-id";

/** Fired after active Case id changes (client UI refresh). */
export const CASES_CHANGED_EVENT = "watchdog:cases-changed";

/** Bumped on switch so a stale Overview loader cannot heal the previous Case. */
let activeCaseHealEpoch = 0;

export function bumpActiveCaseHealEpoch(): void {
  activeCaseHealEpoch += 1;
}

export function getActiveCaseHealEpoch(): number {
  return activeCaseHealEpoch;
}

export function notifyCasesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CASES_CHANGED_EVENT));
}
