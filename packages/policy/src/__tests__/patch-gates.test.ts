import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";

import type { PatchOp } from "@watchdog/schemas";

import { assertPatchGates, assertPatchShape } from "../patch-gates.ts";

describe("patch-gates", () => {
  const entityId = "11111111-1111-4111-8111-111111111111";
  const evidenceId = "22222222-2222-4222-8222-222222222222";
  const opId = "33333333-3333-4333-8333-333333333333";

  function claimOp(overrides: Partial<PatchOp> = {}): PatchOp {
    return {
      op: "create",
      resource: "claim",
      id: opId,
      data: {
        entityId,
        text: "observed host",
        class: "observation",
      },
      ...overrides,
    };
  }

  function edgeOp(predicate: string, notes?: string): PatchOp {
    return {
      op: "create",
      resource: "edge",
      id: opId,
      data: {
        fromId: entityId,
        toId: "44444444-4444-4444-8444-444444444444",
        predicate,
        ...(notes === undefined ? {} : { notes }),
      },
    };
  }

  function expectViolation(
    outcome: Result.Result<void, { readonly reason: string }>,
    pattern: RegExp
  ): void {
    expect(Result.isFailure(outcome)).toBe(true);
    if (Result.isFailure(outcome)) {
      expect(outcome.failure.reason).toMatch(pattern);
    }
  }

  it.effect(
    "assertPatchGates rejects confidence-gated patch without confidence",
    () =>
      Effect.gen(function* gatesRejectNoConfidence() {
        const outcome = yield* Effect.result(assertPatchGates([claimOp()]));
        expectViolation(outcome, /confidence is required/);
      })
  );

  it.effect("assertPatchGates accepts unverified with claim ops", () =>
    assertPatchGates([claimOp()], { confidence: "unverified" })
  );

  it.effect("assertPatchGates rejects confirmed with zero evidence", () =>
    Effect.gen(function* gatesRejectConfirmedNoEvidence() {
      const outcome = yield* Effect.result(
        assertPatchGates([claimOp()], {
          confidence: "confirmed",
        })
      );
      expectViolation(outcome, /confirmed requires at least one Evidence/);
    })
  );

  it.effect("assertPatchGates accepts confirmed via op evidenceIds", () =>
    assertPatchGates([claimOp({ evidenceIds: [evidenceId] })], {
      confidence: "confirmed",
    })
  );

  it.effect("assertPatchGates accepts confirmed via sharedEvidenceIds", () =>
    assertPatchGates([claimOp()], {
      confidence: "confirmed",
      sharedEvidenceIds: [evidenceId],
    })
  );

  it.effect("assertPatchGates rejects unknown claim class", () =>
    Effect.gen(function* gatesRejectUnknownClass() {
      const outcome = yield* Effect.result(
        assertPatchGates(
          [
            claimOp({
              data: {
                entityId,
                text: "x",
                class: "not-a-class",
              },
            }),
          ],
          { confidence: "unverified" }
        )
      );
      expectViolation(outcome, /Invalid claim class/);
    })
  );

  it.effect("assertPatchGates rejects unknown edge predicate", () =>
    Effect.gen(function* gatesRejectUnknownPredicate() {
      const outcome = yield* Effect.result(
        assertPatchGates([edgeOp("owns_everything")], {
          confidence: "unverified",
        })
      );
      expectViolation(outcome, /Invalid edge predicate/);
    })
  );

  it.effect("assertPatchGates rejects related_to without notes", () =>
    Effect.gen(function* gatesRejectRelatedToNoNotes() {
      const outcome = yield* Effect.result(
        assertPatchGates([edgeOp("related_to")], {
          confidence: "unverified",
        })
      );
      expectViolation(outcome, /related_to requires notes/);
    })
  );

  it.effect("assertPatchGates accepts related_to with notes", () =>
    assertPatchGates([edgeOp("related_to", "same household hypothesised")], {
      confidence: "unverified",
    })
  );

  it.effect("assertPatchShape accepts claim without confidence", () =>
    assertPatchShape([claimOp()])
  );

  it.effect("assertPatchShape rejects related_to without notes", () =>
    Effect.gen(function* shapeRejectRelatedTo() {
      const outcome = yield* Effect.result(
        assertPatchShape([edgeOp("related_to")])
      );
      expectViolation(outcome, /related_to/);
    })
  );
});
