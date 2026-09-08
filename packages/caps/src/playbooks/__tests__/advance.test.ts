import { describe, expect, it } from "vitest";

import "../../registry.ts";
import {
  decidePlaybookAdvance,
  requirePlaybook,
  predecessorFromJob,
} from "../index.ts";

describe("decidePlaybookAdvance", () => {
  it("waits while the current step is still open", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [{ step: 0, status: "running" }],
      []
    );
    expect(decision).toEqual({ kind: "wait" });
  });

  it("waits while the current step is queued", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [{ step: 0, status: "queued" }],
      []
    );
    expect(decision).toEqual({ kind: "wait" });
  });

  it("advances past stale blocked siblings when another job at the step succeeded", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [
        { step: 0, status: "succeeded" },
        { step: 1, status: "blocked" },
        { step: 1, status: "succeeded" },
      ],
      []
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(2);
  });

  it("waits while a blocked sibling still has a running peer at the same step", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [
        { step: 0, status: "succeeded" },
        { step: 1, status: "blocked" },
        { step: 1, status: "running" },
      ],
      []
    );
    expect(decision).toEqual({ kind: "wait" });
  });

  it("enqueues step 0 when the row is missing", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [],
      []
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(0);
  });

  it("enqueues the next linear step after success", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [{ step: 0, status: "succeeded" }],
      []
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(1);
    expect(decision.inputs).toHaveLength(1);
    expect(decision.inputs[0]?.host).toBe("example.com");
  });

  it("enqueues (releases) when the next step already has blocked rows", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [
        { step: 0, status: "succeeded" },
        { step: 1, status: "blocked" },
      ],
      []
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(1);
  });

  it("enqueues a bind step after success", () => {
    const evidenceId = "00000000-0000-4000-8000-00000000aaa1";
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-contacts"),
      { host: "example.com" },
      [{ step: 0, status: "succeeded" }],
      [
        predecessorFromJob({
          playbookStep: 0,
          evidenceIds: [evidenceId],
          handoff: {},
        }),
      ]
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(1);
    expect(decision.inputs[0]?.evidenceId).toBe(evidenceId);
  });

  it("fans out DNS after CT succeeds with host handoff", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-enumerate"),
      { host: "example.com" },
      [{ step: 0, status: "succeeded" }],
      [
        predecessorFromJob({
          playbookStep: 0,
          evidenceIds: [],
          handoff: { host: ["a.example.com", "b.example.com"] },
        }),
      ]
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(1);
    expect(decision.inputs).toHaveLength(2);
  });

  it("abandons when the prior step failed", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [{ step: 0, status: "failed" }],
      []
    );
    expect(decision.kind).toBe("abandon");
  });

  it("abandons when every sibling failed before a linear next step", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [
        { step: 0, status: "failed" },
        { step: 0, status: "cancelled" },
      ],
      []
    );
    expect(decision.kind).toBe("abandon");
  });

  it("abandons when fan-out input fails to parse", () => {
    const playbook = {
      ...requirePlaybook("host-enumerate"),
      steps: [
        "network.ct.lookup",
        {
          capabilityId: "identity.email.lookup",
          fanOut: {
            from: { step: 0, bag: "host" as const },
            to: "entityId",
            max: 25,
          },
        },
      ],
    };
    const decision = decidePlaybookAdvance(
      playbook,
      { host: "example.com" },
      [{ step: 0, status: "succeeded" }],
      [
        predecessorFromJob({
          playbookStep: 0,
          evidenceIds: [],
          handoff: { host: ["a.example.com"] },
        }),
      ]
    );
    expect(decision.kind).toBe("abandon");
    if (decision.kind !== "abandon") return;
    expect(decision.reason).toMatch(/fan-out failed/i);
  });

  it("finishes when fan-out materializes an empty bag", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-enumerate"),
      { host: "example.com" },
      [{ step: 0, status: "succeeded" }],
      [
        predecessorFromJob({
          playbookStep: 0,
          evidenceIds: [],
          handoff: { host: [] },
        }),
      ]
    );
    expect(decision).toEqual({ kind: "finish" });
  });

  it("finishes when every step is terminal", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-posture"),
      { host: "example.com" },
      [
        { step: 0, status: "succeeded" },
        { step: 1, status: "succeeded" },
      ],
      []
    );
    expect(decision).toEqual({ kind: "finish" });
  });

  it("abandons when the final step failed", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-posture"),
      { host: "example.com" },
      [
        { step: 0, status: "succeeded" },
        { step: 1, status: "failed" },
      ],
      []
    );
    expect(decision).toEqual({
      kind: "abandon",
      reason: "Cancelled — playbook step failed",
    });
  });
});
