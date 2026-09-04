import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { DomainError } from "../domain-error";
import { mapPostgresCatch, tryDb } from "../postgres-effect";
import { ConflictError, InvalidError } from "../tagged-errors";

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
    expect(mapped.reason).toBe('Slug "alpha" already exists');
  });

  it("maps DomainError via mapDomainCatch", () => {
    const mapped = mapPostgresCatch(
      new DomainError("invalid", "Failed to create Case")
    );
    expect(mapped).toBeInstanceOf(InvalidError);
  });
});

describe("tryDb", () => {
  it("succeeds with the promise value", async () => {
    const value = await Effect.runPromise(tryDb(async () => 7));
    expect(value).toBe(7);
  });
});
