import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { DomainError } from "../domain-error";
import {
  fromDomainError,
  InvalidError,
  isDomainTag,
  mapDomainCatch,
  NotFoundError,
} from "../tagged-errors";

describe("tagged domain errors", () => {
  it("maps DomainError codes 1:1", () => {
    const mapped = fromDomainError(
      new DomainError("not_found", "Credential WHOIS_API_KEY is not configured")
    );
    expect(mapped).toBeInstanceOf(NotFoundError);
    expect(mapped._tag).toBe("NotFoundError");
  });

  it.effect("yields as a typed failure inside Effect.gen", () =>
    Effect.gen(function* taggedYield() {
      const program = Effect.gen(function* taggedFail() {
        return yield* new InvalidError({ reason: "Secret must be non-empty" });
      }).pipe(
        Effect.catchTag("InvalidError", (error) => Effect.succeed(error.reason))
      );
      const reason = yield* program;
      expect(reason).toBe("Secret must be non-empty");
    })
  );

  it("passes tagged errors through mapDomainCatch", () => {
    const tagged = new InvalidError({ reason: "bad date" });
    expect(mapDomainCatch(tagged)).toBe(tagged);
  });

  it("isDomainTag recognizes tagged failures", () => {
    expect(isDomainTag(new InvalidError({ reason: "bad" }))).toBe(true);
    expect(isDomainTag(new Error("nope"))).toBe(false);
  });
});
