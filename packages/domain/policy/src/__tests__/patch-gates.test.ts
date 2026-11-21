import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";

import type { PatchOp } from "#schemas/graph";

import { assertPatchGates } from "../patch-gates.ts";

describe("patch-gates", () => {
  const entityId = "11111111-1111-4111-8111-111111111111";
  const evidenceId = "22222222-2222-4222-8222-222222222222";
  const opId = "33333333-3333-4333-8333-333333333333";

  function claimOp(overrides: { evidenceIds?: string[] } = {}): PatchOp {
    return {
      kind: "claim.create",
      id: opId,
      data: {
        entityId,
        text: "observed host",
        class: "observation",
      },
      ...overrides,
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

  it.effect(
    "assertPatchGates accepts confirmed via padded sharedEvidenceIds",
    () =>
      assertPatchGates([claimOp()], {
        confidence: "confirmed",
        sharedEvidenceIds: [`  ${evidenceId}  `],
      })
  );

  it.effect(
    "assertPatchGates rejects confirmed when op evidenceIds has invalid UUID",
    () =>
      Effect.gen(function* gatesRejectInvalidOpEvidence() {
        const outcome = yield* Effect.result(
          assertPatchGates([claimOp({ evidenceIds: ["not-a-uuid"] })], {
            confidence: "confirmed",
          })
        );
        expectViolation(outcome, /invalid UUID/);
      })
  );

  it.effect(
    "assertPatchGates rejects confirmed when sharedEvidenceIds has invalid UUID",
    () =>
      Effect.gen(function* gatesRejectInvalidSharedEvidence() {
        const outcome = yield* Effect.result(
          assertPatchGates([claimOp()], {
            confidence: "confirmed",
            sharedEvidenceIds: [evidenceId, "not-a-uuid"],
          })
        );
        expectViolation(outcome, /invalid UUID/);
      })
  );

  it.effect(
    "assertPatchGates rejects confirmed when shared evidence is whitespace only",
    () =>
      Effect.gen(function* gatesRejectWhitespaceSharedEvidence() {
        const outcome = yield* Effect.result(
          assertPatchGates([claimOp()], {
            confidence: "confirmed",
            sharedEvidenceIds: ["  ", ""],
          })
        );
        expectViolation(outcome, /confirmed requires at least one Evidence/);
      })
  );
});
