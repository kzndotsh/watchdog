import { describe, expect, it } from "vitest";

import { seedCase, seedEvidence, seedJob, withTestTx } from "@watchdog/test-db";

import { capCacheRepo } from "../cap-cache.repo.ts";

describe("capCacheRepo", () => {
  it("lookupActive expires by expiresAt and upserts the same hash", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const now = new Date();
      await capCacheRepo.upsert(tx, {
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        inputHash: "hash-1",
        capVersion: "v1",
        jobId: "11111111-1111-4111-8111-000000000001",
        artifacts: [],
        resultSummary: "first",
        ttlMs: 60_000,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      });
      await capCacheRepo.upsert(tx, {
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        inputHash: "hash-1",
        capVersion: "v1",
        jobId: "11111111-1111-4111-8111-000000000002",
        artifacts: [],
        resultSummary: "second",
        ttlMs: 60_000,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      });
      const hit = await capCacheRepo.lookupActive(
        tx,
        cased.id,
        "network.dns.lookup",
        "hash-1",
        "v1",
        now
      );
      expect(hit?.resultSummary).toBe("second");

      const expired = await capCacheRepo.lookupActive(
        tx,
        cased.id,
        "network.dns.lookup",
        "hash-1",
        "v1",
        new Date(now.getTime() + 120_000)
      );
      expect(expired).toBeNull();
    });
  });

  it("does not return another case's cache row for the same input", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx, { name: "Case A" });
      const caseB = await seedCase(tx, { name: "Case B" });
      const now = new Date();
      await capCacheRepo.upsert(tx, {
        caseId: caseA.id,
        capabilityId: "network.dns.lookup",
        inputHash: "hash-1",
        capVersion: "v1",
        jobId: "11111111-1111-4111-8111-00000000000a",
        artifacts: [],
        resultSummary: "case-a",
        ttlMs: 60_000,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      });

      const miss = await capCacheRepo.lookupActive(
        tx,
        caseB.id,
        "network.dns.lookup",
        "hash-1",
        "v1",
        now
      );
      expect(miss).toBeNull();

      const hit = await capCacheRepo.lookupActive(
        tx,
        caseA.id,
        "network.dns.lookup",
        "hash-1",
        "v1",
        now
      );
      expect(hit?.resultSummary).toBe("case-a");
    });
  });

  it("returns the evidence ids linked to the cached job, in landing order", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const first = await seedEvidence(tx, cased.id);
      const second = await seedEvidence(tx, cased.id);
      const job = await seedJob(tx, cased.id, {
        evidenceIds: [second.id, first.id],
      });
      const now = new Date();
      await capCacheRepo.upsert(tx, {
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        inputHash: "hash-evidence",
        capVersion: "v1",
        jobId: job.id,
        artifacts: [],
        resultSummary: "with-evidence",
        ttlMs: 60_000,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      });

      const hit = await capCacheRepo.lookupActive(
        tx,
        cased.id,
        "network.dns.lookup",
        "hash-evidence",
        "v1",
        now
      );
      expect(hit?.evidenceIds).toEqual([second.id, first.id]);
    });
  });

  it("treats a row of another Cap version as a miss, and the next upsert overwrites it", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const now = new Date();
      const row = {
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        inputHash: "hash-version",
        artifacts: [],
        ttlMs: 60_000,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      };
      await capCacheRepo.upsert(tx, {
        ...row,
        capVersion: "old",
        jobId: "11111111-1111-4111-8111-0000000000a1",
        resultSummary: "old-code",
      });
      const lookup = (version: string) =>
        capCacheRepo.lookupActive(
          tx,
          cased.id,
          "network.dns.lookup",
          "hash-version",
          version,
          now
        );
      expect(await lookup("new")).toBeNull();
      expect((await lookup("old"))?.resultSummary).toBe("old-code");

      await capCacheRepo.upsert(tx, {
        ...row,
        capVersion: "new",
        jobId: "11111111-1111-4111-8111-0000000000a2",
        resultSummary: "new-code",
      });
      expect((await lookup("new"))?.resultSummary).toBe("new-code");
      // One row per key: the old version's row was overwritten, not kept beside it.
      expect(await lookup("old")).toBeNull();
    });
  });
});
