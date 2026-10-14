import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy";
import { CONFIDENCE_TIERS } from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit";

import {
  ConflictError,
  InvalidError,
  MAX_ECHOED_ID_CHARS,
  NotFoundError,
} from "../../../infra/tagged-errors";
import {
  assertConfidenceEvidenceEffect,
  missedUpdateEffect,
  requireTrimmedCaseIdEffect,
  requireTrimmedGraphId,
} from "../guards";

describe("graph patch guards", () => {
  it("requireTrimmedGraphId accepts padded UUIDs", async () => {
    const id = testId(10);
    const result = await Effect.runPromise(
      requireTrimmedGraphId(`  ${id}  `, "Entity")
    );
    expect(result).toBe(id);
  });

  it("requireTrimmedGraphId rejects non-uuid strings", async () => {
    await expect(
      Effect.runPromise(requireTrimmedGraphId("host-footprint", "Entity"))
    ).rejects.toMatchObject({
      _tag: "NotFoundError",
    });
  });

  it("requireTrimmedGraphId echoes a trimmed, length-bounded id", async () => {
    const hostile = `   ${"x".repeat(5000)}   `;
    const failure = await Effect.runPromise(
      Effect.flip(requireTrimmedGraphId(hostile, "Entity"))
    );
    if (!(failure instanceof NotFoundError)) {
      expect.unreachable("expected NotFoundError");
    }
    const echoed = failure.id;
    expect(echoed.length).toBeLessThanOrEqual(MAX_ECHOED_ID_CHARS);
    expect(echoed).toBe(echoed.trim());
    expect(echoed.startsWith("xxx")).toBe(true);
  });

  it("requireTrimmedCaseIdEffect bounds the echoed id too", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(requireTrimmedCaseIdEffect("y".repeat(5000)))
    );
    if (!(failure instanceof NotFoundError)) {
      expect.unreachable("expected NotFoundError");
    }
    expect(failure.id.length).toBeLessThanOrEqual(MAX_ECHOED_ID_CHARS);
  });
});

describe("assertConfidenceEvidenceEffect", () => {
  it("refuses confirmed without Evidence as an InvalidError carrying the policy message", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(assertConfidenceEvidenceEffect("confirmed", []))
    );
    expect(failure).toBeInstanceOf(InvalidError);
    expect(failure.message).toBe(CONFIRMED_REQUIRES_EVIDENCE);
  });

  it("counts every id: one is enough, more are fine", async () => {
    await expect(
      Effect.runPromise(
        assertConfidenceEvidenceEffect("confirmed", [testId(1)])
      )
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(
        assertConfidenceEvidenceEffect("confirmed", [testId(1), testId(2)])
      )
    ).resolves.toBeUndefined();
  });

  it("never asks a lower tier for Evidence", async () => {
    for (const confidence of CONFIDENCE_TIERS) {
      if (confidence === "confirmed") continue;
      // oxlint-disable-next-line eslint/no-await-in-loop -- one tier at a time names the failing tier
      await expect(
        Effect.runPromise(assertConfidenceEvidenceEffect(confidence, []))
      ).resolves.toBeUndefined();
    }
  });
});

describe("missedUpdateEffect", () => {
  const target = { entity: "Task", id: testId(5) } as const;

  it("is a conflict with the given reason when the row still exists", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(missedUpdateEffect(true, target, "Task changed meanwhile"))
    );
    expect(failure).toBeInstanceOf(ConflictError);
    expect(failure.message).toBe("Task changed meanwhile");
  });

  it("is not_found for the target when the row is gone", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(missedUpdateEffect(false, target, "Task changed meanwhile"))
    );
    expect(failure).toBeInstanceOf(NotFoundError);
    expect(failure).toMatchObject({ entity: "Task", id: target.id });
  });
});
