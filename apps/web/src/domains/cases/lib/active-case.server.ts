import "@tanstack/react-start/server-only";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";

import { ACTIVE_CASE_COOKIE } from "@/domains/cases/lib/active-case";
import { parseTrimmedCaseId, trimmedOrNull } from "@watchdog/schemas";

const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: true,
};

function normalizeActiveCaseId(caseId: string | null): string | null {
  const trimmed = trimmedOrNull(caseId);
  if (trimmed === null) return null;
  return parseTrimmedCaseId(trimmed);
}

/** Read active Case id from the request cookie (null if unset or blank). */
export function readActiveCaseId(): string | null {
  return normalizeActiveCaseId(getCookie(ACTIVE_CASE_COOKIE) ?? null);
}

/** Persist or clear the active Case cookie on the response. */
export function writeActiveCaseId(caseId: string | null): void {
  const scoped = normalizeActiveCaseId(caseId);
  if (scoped !== null) {
    setCookie(ACTIVE_CASE_COOKIE, scoped, COOKIE_OPTS);
    return;
  }
  deleteCookie(ACTIVE_CASE_COOKIE, { path: "/" });
}
