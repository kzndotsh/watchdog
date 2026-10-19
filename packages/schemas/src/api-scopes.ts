import { z } from "zod";

import type { ApiCredential } from "./api-caller";

/**
 * API key scopes (`resource:level`). A key carries a set of them; a session carries none and is
 * never scope-checked. Any write scope implies `cases:read`. One source: the API middleware, the
 * routes outside the router, the CLI and the key presets all import from here.
 */
export const SCOPES = [
  "cases:read",
  "evidence:write",
  "proposals:write",
  "graph:write",
] as const;

export type Scope = (typeof SCOPES)[number];

export const scopeSchema = z.enum(SCOPES);

/** What a procedure declares: a key scope, session-only, or open to anyone (health probes). */
export type ProcedureScope = Scope | "session" | "public";

const READ_SCOPE: Scope = "cases:read";

/** `scope` plus everything it implies (a write scope implies `cases:read`). */
export function impliedScopes(scope: Scope): readonly Scope[] {
  return scope === READ_SCOPE ? [scope] : [scope, READ_SCOPE];
}

/** Whether `held` grants `required`, counting implied scopes. */
export function hasScope(held: ReadonlySet<Scope>, required: Scope): boolean {
  if (held.has(required)) return true;
  return required === READ_SCOPE && SCOPES.some((scope) => held.has(scope));
}

/** The scopes a key is stored with: `scopes` plus what they imply, always including `cases:read`, in `SCOPES` order. */
export function normalizeScopes(scopes: readonly Scope[]): Scope[] {
  const held = new Set<Scope>([READ_SCOPE]);
  for (const scope of scopes) {
    for (const implied of impliedScopes(scope)) held.add(implied);
  }
  return SCOPES.filter((scope) => held.has(scope));
}

/** Key-creation presets, as the Settings dialog offers them. Each is already normalised. */
export const SCOPE_PRESETS = {
  agent: ["cases:read", "proposals:write"],
  collector: ["cases:read", "evidence:write", "proposals:write"],
  full: SCOPES,
} as const satisfies Record<string, readonly Scope[]>;

export type ScopePresetId = keyof typeof SCOPE_PRESETS;

/** The longest a key may live: 365 days, the api-key plugin's `maxExpiresIn`. */
const MAX_KEY_LIFETIME_SECONDS = 31_536_000;

/** What a new key is created with, from the browser: a name, the chosen scopes and an optional lifetime in seconds. */
export const createApiKeyInputSchema = z.object({
  name: z.string().trim().max(32).optional(),
  scopes: z.array(scopeSchema).min(1),
  expiresIn: z
    .number()
    .int()
    .positive()
    .max(MAX_KEY_LIFETIME_SECONDS)
    .optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeyInputSchema>;

/** Better Auth's native permission statement: resource to the levels granted on it. */
const permissionsSchema = z
  .object({
    cases: z.array(z.enum(["read"])).optional(),
    evidence: z.array(z.enum(["write"])).optional(),
    proposals: z.array(z.enum(["write"])).optional(),
    graph: z.array(z.enum(["write"])).optional(),
  })
  .strict();

/** The stored statement for `scopes` (normalised first), the inverse of `parseKeyScopes`. */
export function scopesToPermissions(
  scopes: readonly Scope[]
): Record<string, string[]> {
  const statement: Record<string, string[]> = {};
  for (const scope of normalizeScopes(scopes)) {
    const [resource = "", level = ""] = scope.split(":");
    (statement[resource] ??= []).push(level);
  }
  return statement;
}

export type ParsedKeyScopes =
  | { ok: true; scopes: ReadonlySet<Scope> }
  | { ok: false };

function legacyScopes(): ParsedKeyScopes {
  return { ok: true, scopes: new Set<Scope>([READ_SCOPE]) };
}

/**
 * Scopes held by an API key, from its stored `apikey.permissions` (Better Auth's statement
 * shape, e.g. `{ cases: ["read"], evidence: ["write"] }`; a JSON string is accepted too).
 * A key with no stored permissions (created before scopes existed) gets `cases:read` only;
 * anything unparseable, or naming a resource or level outside the vocabulary, is `ok: false`
 * and the caller must deny the key. Write scopes imply `cases:read` in the result.
 */
export function parseKeyScopes(permissions: unknown): ParsedKeyScopes {
  let value = permissions;
  if (typeof value === "string") {
    if (value.trim() === "") return legacyScopes();
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false };
    }
  }
  if (value === null || value === undefined) return legacyScopes();
  const parsed = permissionsSchema.safeParse(value);
  if (!parsed.success) return { ok: false };
  const scopes = new Set<Scope>();
  for (const [resource, levels] of Object.entries(parsed.data)) {
    for (const level of levels ?? []) {
      const scope = scopeSchema.safeParse(`${resource}:${level}`);
      if (scope.success) {
        for (const implied of impliedScopes(scope.data)) scopes.add(implied);
      }
    }
  }
  return scopes.size === 0 ? legacyScopes() : { ok: true, scopes };
}

/** The `FORBIDDEN` data a missing scope answers with (the `insufficient_scope` arm of the API error map). */
export type InsufficientScopeData = {
  code: "insufficient_scope";
  requiredScope: Scope;
};

export function insufficientScopeData(
  requiredScope: Scope
): InsufficientScopeData {
  return { code: "insufficient_scope", requiredScope };
}

export function insufficientScopeMessage(requiredScope: Scope): string {
  return `This API key lacks the ${requiredScope} scope`;
}

/** Whether `credential` may do something needing `scope`: a session always, a key by its scopes. */
export function credentialHasScope(
  credential: ApiCredential,
  scope: Scope
): boolean {
  return credential.kind === "session" || hasScope(credential.scopes, scope);
}

/**
 * The one scope check for HTTP routes outside the oRPC router that accept API keys (Case export,
 * entity export, the activity stream): `null` when the credential holds `scope`, otherwise the
 * 403 to return. The body has the shape of the router's `FORBIDDEN` error, so one client handles
 * both. Router procedures declare their scope in `.meta` instead (`@watchdog/api`).
 */
export function requireScope(
  credential: ApiCredential,
  scope: Scope
): Response | null {
  if (credentialHasScope(credential, scope)) return null;
  return Response.json(
    {
      defined: true,
      code: "FORBIDDEN",
      status: 403,
      message: insufficientScopeMessage(scope),
      data: insufficientScopeData(scope),
    },
    { status: 403 }
  );
}
