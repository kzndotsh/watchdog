import { describe, expect, it } from "vitest";

import type { PatchOp } from "@watchdog/schemas/graph";

import { patchNeedsConfidence } from "../patch-needs-confidence.ts";

const entityId = "11111111-1111-4111-8111-000000000020";
const opId = "11111111-1111-4111-8111-000000000030";

describe("patchNeedsConfidence", () => {
  it("is true for claim, identifier, and edge ops", () => {
    const claim: PatchOp = {
      kind: "claim.create",
      id: opId,
      data: { entityId, text: "Ada observed a host", class: "observation" },
    };
    const identifier: PatchOp = {
      kind: "identifier.create",
      id: opId,
      data: { entityId, type: "email", value: "ada@mailhost.test" },
    };
    const edge: PatchOp = {
      kind: "edge.create",
      id: opId,
      data: {
        fromId: entityId,
        toId: entityId,
        predicate: "owns",
      },
    };
    expect(patchNeedsConfidence([claim])).toBe(true);
    expect(patchNeedsConfidence([identifier])).toBe(true);
    expect(patchNeedsConfidence([edge])).toBe(true);
  });

  it("is false for entity, event, and question-only patches", () => {
    const entity: PatchOp = {
      kind: "entity.create",
      id: opId,
      data: { name: "Ada", slug: "ada", kind: "person" },
    };
    const event: PatchOp = {
      kind: "event.create",
      id: opId,
      data: { entityId, when: "1815-12-10", what: "Born" },
    };
    const question: PatchOp = {
      kind: "question.create",
      id: opId,
      data: { entityId, text: "Where?" },
    };
    expect(patchNeedsConfidence([entity, event, question])).toBe(false);
  });

  it("is false for missing or empty patch", () => {
    expect(patchNeedsConfidence([])).toBe(false);
    expect(patchNeedsConfidence(undefined)).toBe(false);
    expect(patchNeedsConfidence(null)).toBe(false);
  });
});
