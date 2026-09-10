import { beforeEach, describe, expect, it } from "vitest";

import { runDomain } from "@watchdog/core";
import { db } from "@watchdog/db";
import { resetTestDb, seedCase } from "@watchdog/test-kit/db";

import { lookupCapCacheEffect, storeCapCacheEffect } from "../cap-cache.ts";

describe("storeCapCacheEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("trims padded resultSummary before upsert", async () => {
    const cased = await seedCase(db);
    const jobId = "11111111-1111-4111-8111-000000000088";
    await runDomain(
      storeCapCacheEffect({
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        inputHash: "hash-summary",
        jobId,
        artifacts: [],
        resultSummary: "  trimmed summary  ",
        ttlMs: 60_000,
      })
    );

    const hit = await runDomain(
      lookupCapCacheEffect({
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        inputHash: "hash-summary",
      })
    );
    expect(hit?.resultSummary).toBe("trimmed summary");
  });
});
