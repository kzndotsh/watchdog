import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { mapPostgresCatch, requireWritten, tryDb } from "../postgres-effect";
import { ConflictError, InternalError, InvalidError } from "../tagged-errors";

describe("mapPostgresCatch", () => {
  it("maps unique violations to ConflictError", () => {
    const error = Object.assign(
      new Error('duplicate key "cases_slug_unique"'),
      {
        code: "23505",
        constraint: "cases_slug_unique",
      }
    );
    const mapped = mapPostgresCatch(error, {
      uniqueIndex: "cases_slug_unique",
      conflictReason: 'Slug "alpha" already exists',
    });
    expect(mapped).toBeInstanceOf(ConflictError);
    expect(mapped).toMatchObject({ reason: 'Slug "alpha" already exists' });
  });

  it("passes tagged errors through", () => {
    const tagged = new InvalidError({ reason: "bad" });
    expect(mapPostgresCatch(tagged)).toBe(tagged);
  });

  it("rethrows unrecognized errors so they stay defects", () => {
    expect(() => mapPostgresCatch(new Error("driver"))).toThrow("driver");
  });
});

describe("tryDb", () => {
  it("succeeds with the promise value", async () => {
    const value = await Effect.runPromise(tryDb(async () => 7));
    expect(value).toBe(7);
  });
});

describe("requireWritten", () => {
  it("passes a written row through", async () => {
    const row = await Effect.runPromise(
      tryDb(async () => ({ id: "c1" })).pipe(requireWritten("create Claim"))
    );
    expect(row).toEqual({ id: "c1" });
  });

  it.each([null, undefined, false])(
    "turns a missing write (%s) into InternalError with the Failed-to reason",
    async (miss) => {
      const failure = await Effect.runPromise(
        Effect.flip(
          tryDb(() => Promise.resolve(miss)).pipe(
            requireWritten("create Claim")
          )
        )
      );
      expect(failure).toBeInstanceOf(InternalError);
      expect(failure).toMatchObject({
        code: "internal",
        reason: "Failed to create Claim",
      });
    }
  );

  it("keeps true as written (link results)", async () => {
    await expect(
      Effect.runPromise(
        tryDb(async () => true).pipe(requireWritten("link evidence"))
      )
    ).resolves.toBe(true);
  });

  it("leaves an upstream tagged error untouched", async () => {
    const tagged = new InvalidError({ reason: "bad" });
    const failure = await Effect.runPromise(
      Effect.flip(
        tryDb(() => Promise.reject(tagged)).pipe(requireWritten("create Claim"))
      )
    );
    expect(failure).toBe(tagged);
  });
});
