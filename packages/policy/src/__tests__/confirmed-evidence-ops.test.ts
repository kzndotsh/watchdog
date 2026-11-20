import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";

import type { PatchOp } from "@watchdog/schemas/graph";

import { assertPatchGates } from "../patch-gates.ts";

/**
 * The confirmed-evidence predicate of the custody gate over a patch's ops, one behavior per
 * case (issue #273). The shape of each op is the patch op schema's (`@watchdog/schemas`).
 */
const entityId = "11111111-1111-4111-8111-111111111111";
const evidenceId = "22222222-2222-4222-8222-222222222222";
const otherEvidenceId = "55555555-5555-4555-8555-555555555555";
const opId = "33333333-3333-4333-8333-333333333333";

function claim(
  data: { entityId: string; text: string },
  extra: { evidenceIds?: string[] } = {}
): PatchOp {
  return { kind: "claim.create", id: opId, data, ...extra };
}

function gateReasonOf(
  patch: PatchOp[],
  opts: Parameters<typeof assertPatchGates>[1]
) {
  return Effect.gen(function* gateReason() {
    const outcome = yield* Effect.result(assertPatchGates(patch, opts));
    return Result.isFailure(outcome) ? outcome.failure.reason : null;
  });
}

describe("assertPatchGates confirmed evidence over op evidenceIds", () => {
  const confirmed = { confidence: "confirmed" } as const;
  const withIds = (evidenceIds: string[]) => [
    claim({ entityId, text: "observed host" }, { evidenceIds }),
  ];
  const NEEDS = "confirmed requires at least one Evidence attachment";

  // Blank entries are dropped, so one real id among them is still Evidence.
  for (const [name, ids] of [
    ["a real id then a blank", [evidenceId, ""]],
    ["a blank then a real id", ["", evidenceId]],
    ["a real id among whitespace-only entries", ["  ", evidenceId, "\t"]],
    ["a padded real id", [`  ${evidenceId}  `]],
  ] as const) {
    it.effect(`allows confirmed with ${name}`, () =>
      assertPatchGates(withIds([...ids]), confirmed)
    );
  }

  for (const [name, ids] of [
    ["only blank ids", ["", ""]],
    ["only whitespace ids", ["  ", "\n"]],
    ["no ids", []],
  ] as const) {
    it.effect(`refuses confirmed with ${name}`, () =>
      Effect.gen(function* refusesBlank() {
        expect(yield* gateReasonOf(withIds([...ids]), confirmed)).toBe(NEEDS);
      })
    );
  }

  it.effect("names an invalid id among valid ones instead of ignoring it", () =>
    Effect.gen(function* namesInvalid() {
      expect(
        yield* gateReasonOf(withIds([evidenceId, "not-a-uuid"]), confirmed)
      ).toBe("patch op evidenceIds contains an invalid UUID");
    })
  );

  it.effect("counts Evidence on any one op, not on every op", () =>
    assertPatchGates(
      [
        claim({ entityId, text: "first, no evidence" }),
        claim(
          { entityId, text: "second, with evidence" },
          { evidenceIds: [otherEvidenceId] }
        ),
      ],
      confirmed
    )
  );

  it.effect("refuses confirmed when no op has any Evidence", () =>
    Effect.gen(function* refusesAllEmpty() {
      expect(
        yield* gateReasonOf(
          [
            claim({ entityId, text: "first" }),
            claim({ entityId, text: "second" }, { evidenceIds: [""] }),
          ],
          confirmed
        )
      ).toBe(NEEDS);
    })
  );

  it.effect("lets shared Evidence cover ops that carry none", () =>
    assertPatchGates([claim({ entityId, text: "observed host" })], {
      ...confirmed,
      sharedEvidenceIds: [evidenceId, ""],
    })
  );

  it.effect("does not ask for Evidence below the confirmed tier", () =>
    Effect.gen(function* belowConfirmed() {
      expect(
        yield* gateReasonOf(withIds([]), { confidence: "possible" })
      ).toBeNull();
    })
  );
});
