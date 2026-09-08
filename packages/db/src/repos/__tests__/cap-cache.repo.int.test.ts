import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { seedCase, seedJob, withTestTx } from "@watchdog/test-kit/db";

import { jobs } from "../../schema/jobs.ts";
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
        now
      );
      expect(hit?.resultSummary).toBe("second");

      const expired = await capCacheRepo.lookupActive(
        tx,
        cased.id,
        "network.dns.lookup",
        "hash-1",
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
        now
      );
      expect(miss).toBeNull();

      const hit = await capCacheRepo.lookupActive(
        tx,
        caseA.id,
        "network.dns.lookup",
        "hash-1",
        now
      );
      expect(hit?.resultSummary).toBe("case-a");
    });
  });

  it("trims padded case id on lookupActive", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const now = new Date();
      await capCacheRepo.upsert(tx, {
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        inputHash: "hash-padded",
        jobId: "11111111-1111-4111-8111-000000000099",
        artifacts: [],
        resultSummary: "padded",
        ttlMs: 60_000,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      });

      const hit = await capCacheRepo.lookupActive(
        tx,
        `  ${cased.id}  `,
        "network.dns.lookup",
        "hash-padded",
        now
      );
      expect(hit?.resultSummary).toBe("padded");
    });
  });

  it("trims padded resultSummary on upsert", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const now = new Date();
      await capCacheRepo.upsert(tx, {
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        inputHash: "hash-summary",
        jobId: "11111111-1111-4111-8111-000000000088",
        artifacts: [],
        resultSummary: "  trimmed summary  ",
        ttlMs: 60_000,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      });

      const hit = await capCacheRepo.lookupActive(
        tx,
        cased.id,
        "network.dns.lookup",
        "hash-summary",
        now
      );
      expect(hit?.resultSummary).toBe("trimmed summary");
    });
  });

  it("returns stored job evidenceIds without filtering invalid entries", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const job = await seedJob(tx, cased.id);
      await tx
        .update(jobs)
        .set({ evidenceIds: ["not-a-uuid"] })
        .where(eq(jobs.id, job.id));
      const now = new Date();
      await capCacheRepo.upsert(tx, {
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        inputHash: "hash-evidence",
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
        now
      );
      expect(hit?.evidenceIds).toEqual(["not-a-uuid"]);
    });
  });
});
