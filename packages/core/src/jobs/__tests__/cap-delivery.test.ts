import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isCapJobPayload } from "../boss";
import {
  extractDomainJobIdFromPayload,
  failInvalidCapDeliveryEffect,
} from "../cap-delivery";

const jobId = "00000000-0000-4000-8000-000000000001";

const { get, failJobEffect } = vi.hoisted(() => ({
  get: vi.fn(),
  failJobEffect: vi.fn(() => Effect.void),
}));

vi.mock("@watchdog/db", () => ({
  db: {},
  jobsRepo: { get },
}));

vi.mock("../stages/helpers", () => ({
  failJobEffect: (...args: unknown[]) => failJobEffect(...args),
  isPlainRecord: (value: unknown) =>
    typeof value === "object" && value !== null && !Array.isArray(value),
}));

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

describe("failInvalidCapDeliveryEffect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails open queued jobs with invalid payloads", async () => {
    get.mockResolvedValue({
      id: jobId,
      caseId: "00000000-0000-4000-8000-000000000002",
      status: "queued",
      logs: [{ line: "queued" }],
    });

    await Effect.runPromise(failInvalidCapDeliveryEffect(`  ${jobId}  `));

    expect(get).toHaveBeenCalledWith({}, jobId);
    expect(failJobEffect).toHaveBeenCalledWith(
      jobId,
      "invalid_payload",
      { caseId: "00000000-0000-4000-8000-000000000002" },
      [{ line: "queued" }]
    );
  });

  it("skips invalid job ids", async () => {
    await Effect.runPromise(failInvalidCapDeliveryEffect("not-a-uuid"));
    expect(get).not.toHaveBeenCalled();
    expect(failJobEffect).not.toHaveBeenCalled();
  });

  it("skips terminal jobs", async () => {
    get.mockResolvedValue({
      id: jobId,
      caseId: "00000000-0000-4000-8000-000000000002",
      status: "succeeded",
      logs: [],
    });

    await Effect.runPromise(failInvalidCapDeliveryEffect(jobId));

    expect(failJobEffect).not.toHaveBeenCalled();
  });
});
