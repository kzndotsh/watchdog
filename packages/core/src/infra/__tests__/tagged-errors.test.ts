import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  InvalidError,
  isDomainTag,
  mapDomainCatch,
  NotFoundError,
} from "../tagged-errors";

describe("tagged domain errors", () => {
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

  it("derives the NotFoundError message from its entity, in one place", () => {
    const error = new NotFoundError({ entity: "Claim", id: "c-1" });
    expect(error.message).toBe("Claim not found");
    expect(error.entity).toBe("Claim");
    expect(error.id).toBe("c-1");
    expect(new NotFoundError({ entity: "Playbook run", id: "p" }).message).toBe(
      "Playbook run not found"
    );
  });
});
