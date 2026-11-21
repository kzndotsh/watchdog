import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  InvalidError,
  isDomainTag,
  JobStartLimitError,
  mapDomainCatch,
  NotFoundError,
  StaleCursorError,
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

  it("derives the JobStartLimitError message from the scope, limit and wait", () => {
    const organization = new JobStartLimitError({
      scope: "organization",
      limit: 600,
      windowSeconds: 3600,
      retryAfterSeconds: 42,
    });
    expect(organization.code).toBe("job_start_limited");
    expect(organization.message).toBe(
      "Job start limit reached for this organization (600 per 3600 s). Try again in 42 s."
    );
    expect(
      new JobStartLimitError({
        scope: "key",
        limit: 1,
        windowSeconds: 10,
        retryAfterSeconds: 3,
      }).message
    ).toContain("this API key");
    expect(isDomainTag(organization)).toBe(true);
  });

  it("gives a stale list cursor its own code, apart from a malformed one", () => {
    const stale = new StaleCursorError({ list: "evidence" });
    expect(stale.code).toBe("cursor_stale");
    expect(stale.message).toContain("first page");
    expect(new InvalidError({ reason: "Invalid cursor" }).code).toBe("invalid");
    expect(isDomainTag(stale)).toBe(true);
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
