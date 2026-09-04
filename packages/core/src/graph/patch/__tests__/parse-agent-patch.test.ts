import { Effect } from "effect";
import { describe, it, expect } from "vitest";

import {
  parseAgentPatchEffect,
  type ParsedAgentPatch,
  type AgentPatchRefusal,
} from "../parse-agent-patch.ts";

function parseAgentPatch(input: {
  patch: unknown;
  summary?: string;
  evidenceIds?: string[];
}): ParsedAgentPatch | AgentPatchRefusal {
  return Effect.runSync(parseAgentPatchEffect(input));
}

describe("parse-agent-patch", () => {

  const entityId = "11111111-1111-4111-8111-111111111111";
  const opId = "33333333-3333-4333-8333-333333333333";

  function claimPatch() {
    return [
      {
        op: "create",
        resource: "claim",
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

  it("parseAgentPatch rejects smuggled confidence", () => {
    const plan = parseAgentPatch({
      patch: [
        {
          op: "create",
          resource: "claim",
          id: opId,
          data: {
            entityId,
            text: "x",
            confidence: "confirmed",
          },
        },
      ],
    });
    expect(plan.ok).toBe(false);
  });

  it("parseAgentPatch rejects empty patch", () => {
    const plan = parseAgentPatch({ patch: [] });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.error).toMatch(/empty/i);
    }
  });

  it("parseAgentPatch rejects bad edge shape", () => {
    const plan = parseAgentPatch({
      patch: [
        {
          op: "create",
          resource: "edge",
          id: opId,
          data: {
            fromId: entityId,
            toId: "44444444-4444-4444-8444-444444444444",
            predicate: "related_to",
          },
        },
      ],
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.error).toMatch(/related_to/);
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

});

