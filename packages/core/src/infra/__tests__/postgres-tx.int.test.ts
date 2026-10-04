import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  ConflictError,
  InternalError,
  InvalidError,
  type DomainTag,
} from "@watchdog/core/errors";
import { transact } from "@watchdog/core/infra";

/** The tagged failure `transact` surfaces after its DomainError round trip. */
function failWith(error: DomainTag): Promise<DomainTag> {
  return Effect.runPromise(Effect.flip(transact(() => Effect.fail(error))));
}

describe("transact", () => {
  it("preserves InternalError raised inside the transaction body", async () => {
    const cause = new Error("driver detail");
    const failure = await failWith(
      new InternalError({ reason: "Failed to create Case", cause })
    );

    expect(failure).toBeInstanceOf(InternalError);
    expect(failure).toMatchObject({ reason: "Failed to create Case", cause });
  });

  it("keeps InvalidError and ConflictError distinct from InternalError", async () => {
    expect(
      await failWith(new InvalidError({ reason: "bad input" }))
    ).toBeInstanceOf(InvalidError);
    expect(
      await failWith(new ConflictError({ reason: "taken" }))
    ).toBeInstanceOf(ConflictError);
  });
});
