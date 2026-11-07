import { describe, expect, it } from "vitest";

import { isCapJobPayload } from "../boss";
import { extractDomainJobIdFromPayload } from "../cap-delivery";

const jobId = "00000000-0000-4000-8000-000000000001";

describe("extractDomainJobIdFromPayload", () => {
  it("returns a trimmed job id from object payloads", () => {
    expect(
      extractDomainJobIdFromPayload({
        jobId: ` ${jobId} `,
      })
    ).toBe(jobId);
  });

  it("returns undefined for empty, non-object, or non-uuid payloads", () => {
    expect(extractDomainJobIdFromPayload(null)).toBeUndefined();
    expect(extractDomainJobIdFromPayload({ jobId: "" })).toBeUndefined();
    expect(extractDomainJobIdFromPayload({ jobId: "   " })).toBeUndefined();
    expect(
      extractDomainJobIdFromPayload({ jobId: "not-a-uuid" })
    ).toBeUndefined();
  });
});

describe("isCapJobPayload", () => {
  it("accepts trimmed UUID job ids", () => {
    expect(isCapJobPayload({ jobId: ` ${jobId} ` })).toBe(true);
  });

  it("rejects blank or non-uuid job ids", () => {
    expect(isCapJobPayload({ jobId: "" })).toBe(false);
    expect(isCapJobPayload({ jobId: "boss-only" })).toBe(false);
    expect(isCapJobPayload(null)).toBe(false);
  });
});
