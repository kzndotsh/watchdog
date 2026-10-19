import { SCOPES } from "@watchdog/schemas/shared";
import type { Scope } from "@watchdog/schemas/shared";
import { testApiKey } from "@watchdog/schemas/testing";

import { router } from "../router";
import { declaredScope, procedurePaths } from "./org-isolation-fixtures";

/**
 * The key-scope dimension of the isolation matrix: one row per router procedure, derived from the
 * scope it declares through `.meta({ scope })`, never from a hand-written table. A new procedure
 * (or one whose scope changes) is covered, and expected to behave, with no edit here.
 */
export type ScopeRow =
  | { path: string; kind: "scoped"; scope: Scope }
  | { path: string; kind: "session" };

export function scopeRows(): ScopeRow[] {
  return procedurePaths(router).flatMap((path): ScopeRow[] => {
    const scope = declaredScope(router, path);
    if (scope === "session") return [{ path, kind: "session" }];
    const known = SCOPES.find((candidate) => candidate === scope);
    return known === undefined ? [] : [{ path, kind: "scoped", scope: known }];
  });
}

/**
 * The key scope set that must be refused on a procedure needing `scope`: every other scope. For
 * `cases:read` it is the empty set, because any write scope implies read.
 */
export function lackingScopes(scope: Scope): Scope[] {
  return scope === "cases:read"
    ? []
    : SCOPES.filter((candidate) => candidate !== scope);
}

/** Input no procedure accepts, so a call that passes the scope check fails validation, not the handler. */
export const INVALID_INPUT = "wd368-invalid-input";

export const keyWith = (scopes: readonly Scope[]) =>
  testApiKey("wd368-key", scopes);
