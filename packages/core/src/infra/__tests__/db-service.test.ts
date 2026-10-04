import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";

const { client } = vi.hoisted(() => ({ client: { marker: "global-db" } }));

vi.mock("@watchdog/db", () => ({ db: client }));

import { Db } from "../db-service";
import { tryDbWith } from "../postgres-effect";
import { runDomain } from "../run-domain";
import { ConflictError, InvalidError } from "../tagged-errors";

describe("tryDbWith", () => {
  it("hands the live Layer's client to the callback", async () => {
    const seen = await runDomain(tryDbWith(async (exec) => exec));
    expect(seen).toBe(client);
  });

  it("maps unique violations like tryDb", async () => {
    const violation = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "cases_slug_unique",
    });
    const exit = await Effect.runPromiseExit(
      tryDbWith(() => Promise.reject(violation), {
        uniqueIndex: "cases_slug_unique",
        conflictReason: "taken",
      }).pipe(Effect.provide(Db.layer))
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const failure = Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;
    expect(failure).toMatchObject({ error: expect.any(ConflictError) });
  });

  it("passes tagged errors through", async () => {
    const tagged = new InvalidError({ reason: "bad" });
    await expect(
      runDomain(tryDbWith(() => Promise.reject(tagged)))
    ).rejects.toBe(tagged);
  });
});
