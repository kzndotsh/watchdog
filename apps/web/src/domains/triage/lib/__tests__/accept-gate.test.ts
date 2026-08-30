import { describe, expect, it } from "vitest";

import { acceptGate, gatedAcceptInput } from "@/domains/triage/lib/accept-gate";

describe("acceptGate", () => {
  it("blocks Accept when identifier ops are invalid", () => {
    const gate = acceptGate(
      gatedAcceptInput({
        confidence: "possible",
        evidenceIds: [],
        linkedIds: [],
        attestationText: "",
        needsConfidence: true,
        identifierCollisions: [],
        patch: [
          {
            id: "op-1",
            op: "create",
            resource: "identifier",
            data: { type: "email", value: "not-an-email" },
          },
        ],
      })
    );
    expect(gate.status).toBe("blocked");
    expect(gate.canAccept).toBe(false);
    expect(gate.hasInvalidIdentifierOps).toBe(true);
  });

  it("needs when there is zero evidence but Accept is still allowed", () => {
    const gate = acceptGate(
      gatedAcceptInput({
        confidence: "possible",
        evidenceIds: [],
        linkedIds: [],
        attestationText: "",
        needsConfidence: true,
        identifierCollisions: [
          {
            opId: "op-1",
            type: "email",
            value: "a@b.c",
            entityId: "e1",
            entityName: "Ada",
            entitySlug: "ada",
          },
        ],
        patch: [],
      })
    );
    expect(gate.status).toBe("needs");
    expect(gate.canAccept).toBe(true);
    expect(gate.collisionCount).toBe(1);
  });

  it("ready when there are no blockers or needs", () => {
    const gate = acceptGate(
      gatedAcceptInput({
        confidence: "possible",
        evidenceIds: ["ev-1"],
        linkedIds: [],
        attestationText: "",
        needsConfidence: true,
        identifierCollisions: [],
        patch: [],
      })
    );
    expect(gate.status).toBe("ready");
    expect(gate.canAccept).toBe(true);
  });
});
