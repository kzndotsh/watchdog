import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { InternalError } from "../../infra/tagged-errors";

const DRIVER_TEXT = "connect ECONNREFUSED 10.0.0.7:5432 (user=boss)";

vi.mock("pg-boss", () => ({
  PgBoss: class {
    on = vi.fn();
    start = vi.fn().mockRejectedValue(new Error(DRIVER_TEXT));
  },
}));

vi.mock("@watchdog/env/server", () => ({
  env: { DATABASE_URL: "postgresql://x:x@127.0.0.1:5432/x" },
}));

import { enqueueCapJobEffect } from "../boss";

describe("enqueueCapJobEffect", () => {
  it("fails with InternalError, keeping driver text out of the reason, when the queue driver fails", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(
        enqueueCapJobEffect("11111111-1111-4111-8111-000000000001", "whois")
      )
    );

    expect(failure).toBeInstanceOf(InternalError);
    expect(failure).toMatchObject({
      reason: "pg-boss failed",
      cause: expect.objectContaining({ message: DRIVER_TEXT }),
    });
  });
});
