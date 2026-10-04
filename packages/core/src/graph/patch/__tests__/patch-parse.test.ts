import { describe, it, expect } from "vitest";

import { tryParsePatch } from "../patch.ts";

describe("patch-parse", () => {
  const entityId = "11111111-1111-4111-8111-111111111111";
  const opId = "33333333-3333-4333-8333-333333333333";

  it("tryParsePatch rejects smuggled confidence on claim", () => {
    const result = tryParsePatch([
      {
        op: "create",
        resource: "claim",
        id: opId,
        data: {
          entityId,
          text: "smuggled",
          confidence: "confirmed",
        },
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/confidence/i);
    }
  });

  it("tryParsePatch rejects smuggled confidence on identifier", () => {
    const result = tryParsePatch([
      {
        op: "create",
        resource: "identifier",
        id: opId,
        data: {
          entityId,
          type: "email",
          value: "a@b.com",
          confidence: "possible",
        },
      },
    ]);
    expect(result.ok).toBe(false);
  });

  it("tryParsePatch accepts claim without confidence in data", () => {
    const result = tryParsePatch([
      {
        op: "create",
        resource: "claim",
        id: opId,
        data: {
          entityId,
          text: "ok",
          class: "observation",
        },
      },
    ]);
    expect(result.ok).toBe(true);
  });
});
