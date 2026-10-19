import { describe, expect, it } from "vitest";

import { keyScopesDisplay } from "@/auth/ui/api-key/scope-copy";

describe("keyScopesDisplay", () => {
  it("reads a stored JSON string like an object", () => {
    expect(keyScopesDisplay(JSON.stringify({ evidence: ["write"] }))).toEqual({
      kind: "scopes",
      scopes: ["cases:read", "evidence:write"],
    });
  });

  it("calls a key with no statements legacy", () => {
    for (const none of [null, undefined, "", "  ", {}, { cases: [] }]) {
      expect(keyScopesDisplay(none), JSON.stringify(none)).toEqual({
        kind: "legacy",
      });
    }
  });

  it("does not call an explicit cases:read key legacy", () => {
    expect(keyScopesDisplay({ cases: ["read"] })).toEqual({
      kind: "scopes",
      scopes: ["cases:read"],
    });
  });

  it("flags garbage as unreadable", () => {
    for (const bad of [
      "not json",
      { admin: ["write"] },
      { admin: [] },
      { cases: "read" },
    ]) {
      expect(keyScopesDisplay(bad)).toEqual({ kind: "unreadable" });
    }
  });
});
