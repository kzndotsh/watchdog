import { describe, expect, it } from "vitest";

import {
  SCOPES,
  hasScope,
  impliedScopes,
  normalizeScopes,
  parseKeyScopes,
  SCOPE_PRESETS,
  scopesToPermissions,
  createApiKeyInputSchema,
  type Scope,
} from "../api-scopes";

function scopesOf(permissions: unknown): Scope[] | null {
  const parsed = parseKeyScopes(permissions);
  return parsed.ok ? [...parsed.scopes].sort() : null;
}

describe("parseKeyScopes", () => {
  it("denies a key with no stored scopes: nothing is granted by default", () => {
    for (const unscoped of [
      null,
      undefined,
      {},
      "",
      "  ",
      "{}",
      { cases: [] },
    ]) {
      expect(parseKeyScopes(unscoped), JSON.stringify(unscoped)).toEqual({
        ok: false,
      });
    }
  });

  it("reads Better Auth's statement shape, as an object or a JSON string", () => {
    const statement = { cases: ["read"], evidence: ["write"] };
    expect(scopesOf(statement)).toEqual(["cases:read", "evidence:write"]);
    expect(scopesOf(JSON.stringify(statement))).toEqual([
      "cases:read",
      "evidence:write",
    ]);
  });

  it("lets a write scope imply read", () => {
    expect(scopesOf({ graph: ["write"] })).toEqual([
      "cases:read",
      "graph:write",
    ]);
    expect(scopesOf({ proposals: ["write"] })).toContain("cases:read");
  });

  it("denies anything unparseable or outside the vocabulary", () => {
    for (const garbage of [
      "not json",
      "[]",
      42,
      true,
      ["cases:read"],
      { cases: "read" },
      { cases: ["write"] },
      { graph: ["read"] },
      { admin: ["write"] },
      { cases: ["read"], extra: ["x"] },
      { watchdog: ["graph:write"] },
    ]) {
      expect(parseKeyScopes(garbage), JSON.stringify(garbage)).toEqual({
        ok: false,
      });
    }
  });
});

describe("impliedScopes / hasScope", () => {
  it("lists a write scope with cases:read and read alone", () => {
    expect(impliedScopes("evidence:write")).toEqual([
      "evidence:write",
      "cases:read",
    ]);
    expect(impliedScopes("cases:read")).toEqual(["cases:read"]);
  });

  it("grants read to any write scope, and a write scope only to itself", () => {
    for (const write of SCOPES.filter((scope) => scope !== "cases:read")) {
      expect(hasScope(new Set([write]), "cases:read")).toBe(true);
      expect(hasScope(new Set([write]), write)).toBe(true);
      expect(hasScope(new Set(["cases:read"]), write)).toBe(false);
    }
    expect(hasScope(new Set(), "cases:read")).toBe(false);
    expect(hasScope(new Set(["evidence:write"]), "graph:write")).toBe(false);
  });
});

describe("normalizeScopes and scopesToPermissions", () => {
  it("adds cases:read, dedupes and orders by SCOPES", () => {
    expect(
      normalizeScopes(["graph:write", "proposals:write", "graph:write"])
    ).toEqual(["cases:read", "proposals:write", "graph:write"]);
    expect(normalizeScopes([])).toEqual(["cases:read"]);
  });

  it("writes Better Auth's statement shape that parseKeyScopes reads back", () => {
    expect(scopesToPermissions(["evidence:write"])).toEqual({
      cases: ["read"],
      evidence: ["write"],
    });
    for (const preset of Object.values(SCOPE_PRESETS)) {
      expect(scopesOf(scopesToPermissions(preset))).toEqual(
        [...normalizeScopes(preset)].sort()
      );
    }
  });

  it("keeps every preset already normalised", () => {
    for (const preset of Object.values(SCOPE_PRESETS)) {
      expect(normalizeScopes(preset)).toEqual([...preset]);
    }
  });
});

describe("createApiKeyInputSchema expiresIn", () => {
  const parse = (expiresIn: number) =>
    createApiKeyInputSchema.safeParse({ scopes: ["cases:read"], expiresIn });

  it("allows up to 365 days and refuses more", () => {
    expect(parse(31_536_000).success).toBe(true);
    expect(parse(31_536_001).success).toBe(false);
    expect(parse(0).success).toBe(false);
  });
});
