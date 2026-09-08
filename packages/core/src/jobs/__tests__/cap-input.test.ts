import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { testId } from "@watchdog/test-kit";

import { InvalidError } from "../../infra/tagged-errors";
import { parseValidatedCapInputEffect } from "../cap-input";

describe("parseValidatedCapInputEffect", () => {
  const cap = {
    input: z.object({
      entityId: z.uuid().optional(),
      host: z.string().optional(),
    }),
  };

  it("returns normalized cap input for valid values", async () => {
    const entityId = testId(1);
    const result = await Effect.runPromise(
      parseValidatedCapInputEffect(cap, {
        entityId,
        host: "example.com",
      })
    );
    expect(result).toEqual({ entityId, host: "example.com" });
  });

  it("rejects invalid graph ids after schema parse", async () => {
    const permissiveCap = {
      input: z.object({
        host: z.string().optional(),
        entityId: z.string().optional(),
      }),
    };
    await expect(
      Effect.runPromise(
        parseValidatedCapInputEffect(permissiveCap, {
          entityId: "not-a-uuid",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof InvalidError && error.reason === "Invalid entityId"
    );
  });

  it("rejects non-object cap input", async () => {
    await expect(
      Effect.runPromise(parseValidatedCapInputEffect(cap, null))
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof InvalidError &&
        error.reason.includes("Invalid Cap input")
    );
  });
});
