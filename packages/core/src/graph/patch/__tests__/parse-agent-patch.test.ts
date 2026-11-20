import { describe, it, expect } from "vitest";

import type { PatchOp } from "@watchdog/schemas/graph";

import { parseAgentPatch } from "../parse-agent-patch.ts";

describe("parse-agent-patch", () => {
  const entityId = "11111111-1111-4111-8111-111111111111";
  const opId = "33333333-3333-4333-8333-333333333333";

  function claimPatch(): PatchOp[] {
    return [
      {
        kind: "claim.create",
        id: opId,
        data: {
          entityId,
          text: "observed host",
          class: "observation",
        },
      },
    ];
  }

  it("parseAgentPatch accepts valid patch", () => {
    const plan = parseAgentPatch({ patch: claimPatch() });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.patch.length).toBe(1);
      expect(plan.summary).toBe(null);
    }
  });

  it("parseAgentPatch rejects empty patch", () => {
    const plan = parseAgentPatch({ patch: [] });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.error).toMatch(/empty/i);
    }
  });

  it("parseAgentPatch trims summary and dedupes evidence", () => {
    const plan = parseAgentPatch({
      patch: claimPatch(),
      summary: "  note  ",
      evidenceIds: [
        "22222222-2222-4222-8222-222222222222",
        "22222222-2222-4222-8222-222222222222",
      ],
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.summary).toBe("note");
      expect(plan.evidenceIds).toEqual([
        "22222222-2222-4222-8222-222222222222",
      ]);
    }
  });

  it("parseAgentPatch trims and dedupes evidence ids", () => {
    const plan = parseAgentPatch({
      patch: claimPatch(),
      evidenceIds: [
        " 22222222-2222-4222-8222-222222222222 ",
        "22222222-2222-4222-8222-222222222222",
        "  ",
      ],
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.evidenceIds).toEqual([
        "22222222-2222-4222-8222-222222222222",
      ]);
    }
  });

  it("parseAgentPatch rejects invalid evidence ids", () => {
    const plan = parseAgentPatch({
      patch: claimPatch(),
      evidenceIds: ["22222222-2222-4222-8222-222222222222", "not-a-uuid"],
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.error).toMatch(/invalid UUID/i);
    }
  });
});
