const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** The statuses whose `Location` the outbound client follows (one set for every caller). */
export function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

/** A redirect status that carries a `Location` to follow. */
export function isRedirectResponse(
  status: number,
  location: string | null
): location is string {
  return location !== null && isRedirectStatus(status);
}

/** Resolves a `Location` against the URL that returned it. */
export function resolveRedirectUrl(current: string, location: string): string {
  return new URL(location, current).href;
}
