import { describe, expect, it } from "vitest";

import {
  SCOPES,
  hasScope,
  impliedScopes,
  parseKeyScopes,
  type Scope,
} from "../api-scopes";

function scopesOf(permissions: unknown): Scope[] | null {
  const parsed = parseKeyScopes(permissions);
  return parsed.ok ? [...parsed.scopes].sort() : null;
}

describe("parseKeyScopes", () => {
  it("gives a key with no stored permissions cases:read only (created before scopes)", () => {
    for (const legacy of [null, undefined, {}, "", "{}", { cases: [] }]) {
      expect(scopesOf(legacy), JSON.stringify(legacy)).toEqual(["cases:read"]);
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
