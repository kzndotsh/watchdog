import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { JobStartLimitError } from "@watchdog/core/errors";

import { toOrpcError } from "../map-domain-error";
import {
  jobStartLimitResponse,
  retryAfterSecondsOf,
  setRetryAfter,
} from "../retry-after";

const refused = toOrpcError(
  new JobStartLimitError({
    scope: "key",
    limit: 5,
    windowSeconds: 3600,
    retryAfterSeconds: 90,
  })
);

describe("job_start_limited mapping", () => {
  it("is TOO_MANY_REQUESTS (429) with the stable code, the limit and the retry time", () => {
    expect(refused.code).toBe("TOO_MANY_REQUESTS");
    expect(refused.status).toBe(429);
    expect(refused.defined).toBe(true);
    expect(refused.message).toBe(
      "Job start limit reached for this API key (5 per 3600 s). Try again in 90 s."
    );
    expect(refused.data).toEqual({
      code: "job_start_limited",
      scope: "key",
      limit: 5,
      windowSeconds: 3600,
      retryAfterSeconds: 90,
    });
  });
});

describe("retryAfterSecondsOf", () => {
  it("reads the seconds off the mapped error and nothing else", () => {
    expect(retryAfterSecondsOf(refused)).toBe(90);
    expect(retryAfterSecondsOf(new ORPCError("NOT_FOUND"))).toBeUndefined();
    expect(
      retryAfterSecondsOf(
        new ORPCError("TOO_MANY_REQUESTS", { data: { retryAfterSeconds: 0 } })
      )
    ).toBeUndefined();
    expect(retryAfterSecondsOf(new Error("boom"))).toBeUndefined();
  });
});

describe("setRetryAfter", () => {
  it("sets the header for a refused start, and leaves the headers alone otherwise", () => {
    const headers = new Headers();
    setRetryAfter(headers, new ORPCError("FORBIDDEN"));
    expect(headers.has("retry-after")).toBe(false);
    setRetryAfter(headers, refused);
    expect(headers.get("retry-after")).toBe("90");
    expect(() => {
      setRetryAfter(undefined, refused);
    }).not.toThrow();
  });
});

describe("jobStartLimitResponse", () => {
  it("is a 429 with Retry-After and the error body for a refused start", async () => {
    const response = jobStartLimitResponse(refused);
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe("90");
    expect(await response?.json()).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      data: { code: "job_start_limited", retryAfterSeconds: 90 },
    });
  });

  it("is null for any other error", () => {
    expect(jobStartLimitResponse(new Error("x"))).toBeNull();
    expect(jobStartLimitResponse(new ORPCError("NOT_FOUND"))).toBeNull();
  });
});
