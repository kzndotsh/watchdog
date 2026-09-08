import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import {
  seedCase,
  seedEntity,
  seedEvidence,
  seedJob,
  seedPlaybookRun,
  withTestTx,
} from "@watchdog/test-kit/db";

import { jobs } from "../../schema/jobs.ts";
import { evidenceRepo } from "../evidence.repo.ts";
import { jobsRepo } from "../jobs.repo.ts";

describe("jobsRepo", () => {
  it("unblocks historical blocked playbook rows via status update", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await seedPlaybookRun(tx, cased.id);
      const blocked = await seedJob(tx, cased.id, {
        playbookRunId: run.id,
        playbookStep: 1,
        status: "blocked",
      });
      const updated = await jobsRepo.update(tx, blocked.id, {
        status: "queued",
      });
      expect(updated?.status).toBe("queued");
    });
  });

  it("searchForCase matches job input and capability id", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await seedJob(tx, cased.id, {
        capabilityId: "network.shodan.lookup",
        input: { ip: "198.51.100.42" },
      });
      const byIp = await jobsRepo.searchForCase(tx, cased.id, "100.42", 10);
      expect(byIp.some((row) => row.job.input.ip === "198.51.100.42")).toBe(
        true
      );
      const byCap = await jobsRepo.searchForCase(tx, cased.id, "shodan", 10);
      expect(byCap.length).toBeGreaterThan(0);
    });
  });

  it("searchForCase matches evidence label via job input evidenceId", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const evidence = await seedEvidence(tx, cased.id, {
        label: "Vendor Report PDF",
      });
      await seedJob(tx, cased.id, {
        capabilityId: "network.shodan.lookup",
        input: { evidenceId: evidence.id },
      });
      const hits = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "vendor report",
        10
      );
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.job.input.evidenceId).toBe(evidence.id);
    });
  });

  it("searchForCase matches hidden evidence label via job input evidenceId", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const evidence = await seedEvidence(tx, cased.id, {
        label: "Hidden Vendor PDF",
      });
      await evidenceRepo.softDelete(tx, cased.id, evidence.id);
      await seedJob(tx, cased.id, {
        capabilityId: "network.shodan.lookup",
        input: { evidenceId: evidence.id },
      });
      const hits = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "hidden vendor",
        10
      );
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.job.input.evidenceId).toBe(evidence.id);
    });
  });

  it("searchForCase matches evidence notes via job input evidenceId", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const evidence = await seedEvidence(tx, cased.id, {
        label: "quiet.txt",
        notes: "Mailbox tied to the fraud thread",
      });
      await seedJob(tx, cased.id, {
        capabilityId: "evidence.harvest",
        input: { evidenceId: evidence.id },
      });
      const hits = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "fraud thread",
        10
      );
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.job.input.evidenceId).toBe(evidence.id);
    });
  });

  it("searchForCase matches entity name via job input entityId", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        name: "Quiet Holdings",
        slug: "quiet-holdings",
      });
      await seedJob(tx, cased.id, {
        capabilityId: "network.dns.lookup",
        input: { entityId: entity.id, host: "example.com" },
      });
      const byName = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "quiet holdings",
        10
      );
      expect(byName.length).toBeGreaterThan(0);
      expect(byName[0]?.job.input.entityId).toBe(entity.id);

      const bySlug = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "Quiet Holdings",
        10
      );
      expect(bySlug.length).toBeGreaterThan(0);
      expect(bySlug[0]?.job.input.entityId).toBe(entity.id);
    });
  });

  it("searchForCase matches entity name when job input entityId is padded", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        name: "Padded Entity",
        slug: "padded-entity",
      });
      const job = await seedJob(tx, cased.id, {
        capabilityId: "network.dns.lookup",
        input: { entityId: entity.id, host: "example.com" },
      });
      await tx
        .update(jobs)
        .set({ input: { entityId: `  ${entity.id}  `, host: "example.com" } })
        .where(eq(jobs.id, job.id));
      const hits = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "padded entity",
        10
      );
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  it("searchForCase matches evidence label when job input evidenceId is padded", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const evidence = await seedEvidence(tx, cased.id, {
        label: "Padded Evidence Label",
      });
      const job = await seedJob(tx, cased.id, {
        capabilityId: "network.shodan.lookup",
        input: { evidenceId: evidence.id },
      });
      await tx
        .update(jobs)
        .set({ input: { evidenceId: `  ${evidence.id}  ` } })
        .where(eq(jobs.id, job.id));
      const hits = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "padded evidence",
        10
      );
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  it("create trims padded graph ids in job input", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        name: "Stored Entity",
        slug: "stored-entity",
      });
      const evidence = await seedEvidence(tx, cased.id, {
        label: "Stored Evidence",
      });
      const created = await jobsRepo.create(tx, {
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        status: "queued",
        actorId: TEST_ACTOR_ID,
        input: {
          entityId: `  ${entity.id}  `,
          evidenceId: `  ${evidence.id}  `,
          sourceEvidenceId: "   ",
          host: "example.com",
        },
      });
      expect(created?.input).toEqual({
        entityId: entity.id,
        evidenceId: evidence.id,
        host: "example.com",
      });
    });
  });

  it("searchForCase matches playbook id", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await seedPlaybookRun(tx, cased.id, {
        playbookId: "host-footprint",
      });
      await seedJob(tx, cased.id, {
        playbookRunId: run.id,
        playbookStep: 0,
        capabilityId: "network.dns.lookup",
        input: { host: "example.com" },
      });

      const hits = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "host-footprint",
        10
      );
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  it("searchForCase matches humanized playbook label", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await seedPlaybookRun(tx, cased.id, {
        playbookId: "host-footprint",
      });
      await seedJob(tx, cased.id, {
        playbookRunId: run.id,
        playbookStep: 0,
        capabilityId: "network.dns.lookup",
        input: { host: "example.com" },
      });

      const hits = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "host footprint",
        10
      );
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  it("searchForCase matches humanized capability label", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await seedJob(tx, cased.id, {
        capabilityId: "network.shodan.lookup",
        input: { ip: "1.2.3.4" },
      });

      const hits = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "shodan lookup",
        10
      );
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  it("searchForCase matches job error and interpret error", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const failed = await seedJob(tx, cased.id, {
        capabilityId: "network.shodan.lookup",
        status: "failed",
      });
      await jobsRepo.update(tx, failed.id, {
        error: "Connection timed out",
      });
      const interpretFailed = await seedJob(tx, cased.id, {
        capabilityId: "evidence.harvest",
        status: "failed",
      });
      await jobsRepo.update(tx, interpretFailed.id, {
        interpretError: "proposal payload invalid",
      });

      const byError = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "timed out",
        10
      );
      expect(byError.some((row) => row.job.id === failed.id)).toBe(true);

      const byInterpret = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "payload invalid",
        10
      );
      expect(byInterpret.some((row) => row.job.id === interpretFailed.id)).toBe(
        true
      );
    });
  });

  it("searchForCase matches evidence kind display label via job input evidenceId", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const evidence = await seedEvidence(tx, cased.id, {
        label: null,
        kind: "url_archive",
        sourceUrl: "https://example.com/page",
        text: null,
      });
      await seedJob(tx, cased.id, {
        capabilityId: "evidence.harvest",
        input: { evidenceId: evidence.id },
      });
      const hits = await jobsRepo.searchForCase(
        tx,
        cased.id,
        "URL Archive",
        10
      );
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.job.input.evidenceId).toBe(evidence.id);
    });
  });

  it("searchForCase matches job status display label", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const failed = await seedJob(tx, cased.id, {
        capabilityId: "network.shodan.lookup",
        status: "failed",
        input: { ip: "198.51.100.42" },
      });
      const hits = await jobsRepo.searchForCase(tx, cased.id, "Failed", 10);
      expect(hits.some((row) => row.job.id === failed.id)).toBe(true);
    });
  });

  it("searchForCase matches job status", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const failed = await seedJob(tx, cased.id, {
        capabilityId: "network.shodan.lookup",
        status: "failed",
        input: { ip: "198.51.100.42" },
      });
      const hits = await jobsRepo.searchForCase(tx, cased.id, "failed", 10);
      expect(hits.some((row) => row.job.id === failed.id)).toBe(true);
    });
  });

  it("listActiveForCapability includes blocked jobs for dedup", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const blocked = await seedJob(tx, cased.id, {
        capabilityId: "network.url.enrich",
        status: "blocked",
        input: { sourceEvidenceId: "00000000-0000-4000-8000-000000000001" },
      });
      await seedJob(tx, cased.id, {
        capabilityId: "network.url.enrich",
        status: "succeeded",
        input: { sourceEvidenceId: "00000000-0000-4000-8000-000000000002" },
      });
      const active = await jobsRepo.listActiveForCapability(
        tx,
        cased.id,
        "network.url.enrich"
      );
      expect(active.map((row) => row.id)).toEqual([blocked.id]);
    });
  });

  it("abandons blocked playbook jobs and lists running", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await seedPlaybookRun(tx, cased.id);
      const blocked = await seedJob(tx, cased.id, {
        playbookRunId: run.id,
        playbookStep: 1,
        status: "blocked",
      });
      await seedJob(tx, cased.id, { status: "running" });
      const abandonedIds = await jobsRepo.abandonBlockedForPlaybook(
        tx,
        ` ${run.id} `,
        "prior failed"
      );
      expect(abandonedIds).toEqual([blocked.id]);
      const after = await jobsRepo.get(tx, blocked.id);
      expect(after?.status).toBe("cancelled");
      const again = await jobsRepo.abandonBlockedForPlaybook(
        tx,
        run.id,
        "again"
      );
      expect(again).toEqual([]);
      const running = await jobsRepo.listRunning(tx);
      expect(running.length).toBeGreaterThan(0);
    });
  });

  it("updateInCase rejects updates outside the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const job = await seedJob(tx, caseB.id, { status: "running" });
      const updated = await jobsRepo.updateInCase(tx, caseA.id, job.id, {
        status: "cancelled",
      });
      expect(updated).toBeNull();
      const row = await jobsRepo.get(tx, job.id);
      expect(row?.status).toBe("running");
    });
  });

  it("cancelCancellableInCase rejects cancellation outside the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const job = await seedJob(tx, caseB.id, { status: "running" });
      const cancelled = await jobsRepo.cancelCancellableInCase(
        tx,
        caseA.id,
        job.id,
        new Date()
      );
      expect(cancelled).toBeNull();
      const row = await jobsRepo.get(tx, job.id);
      expect(row?.status).toBe("running");
    });
  });

  it("findCancelledJobIds trims and dedupes job ids", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const cancelled = await seedJob(tx, cased.id, { status: "cancelled" });
      const running = await seedJob(tx, cased.id, { status: "running" });
      const ids = await jobsRepo.findCancelledJobIds(tx, [
        `  ${cancelled.id}  `,
        cancelled.id,
        running.id,
      ]);
      expect(ids).toEqual([cancelled.id]);
    });
  });

  it("update normalizes padded evidenceIds", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const evidence = await seedEvidence(tx, cased.id);
      const job = await seedJob(tx, cased.id);
      const updated = await jobsRepo.update(tx, job.id, {
        evidenceIds: [`  ${evidence.id}  `, evidence.id, "  "],
      });
      expect(updated?.evidenceIds).toEqual([evidence.id]);
    });
  });

  it("create rejects invalid evidenceIds", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await jobsRepo.create(tx, {
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        input: { host: "example.com" },
        status: "queued",
        actorId: TEST_ACTOR_ID,
        evidenceIds: ["not-a-uuid"],
      });
      expect(created).toBe(null);
    });
  });

  it("update rejects invalid evidenceIds", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const job = await seedJob(tx, cased.id);
      const updated = await jobsRepo.update(tx, job.id, {
        evidenceIds: ["not-a-uuid"],
      });
      expect(updated).toBe(null);
    });
  });

  it("create rejects invalid playbookRunId", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await jobsRepo.create(tx, {
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        input: { host: "example.com" },
        status: "queued",
        actorId: TEST_ACTOR_ID,
        playbookRunId: "not-a-uuid",
      });
      expect(created).toBeNull();
    });
  });

  it("update rejects invalid proposalId", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const job = await seedJob(tx, cased.id);
      const updated = await jobsRepo.update(tx, job.id, {
        proposalId: "not-a-uuid",
      });
      expect(updated).toBeNull();
    });
  });

  it("trims padded capabilityId and actorLabel on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await jobsRepo.create(tx, {
        caseId: cased.id,
        capabilityId: "  network.dns.lookup  ",
        input: { host: "example.com" },
        status: "queued",
        actorId: TEST_ACTOR_ID,
        actorLabel: "  Ada  ",
      });
      expect(created?.capabilityId).toBe("network.dns.lookup");
      expect(created?.actorLabel).toBe("Ada");
    });
  });

  it("rejects blank capabilityId on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await jobsRepo.create(tx, {
        caseId: cased.id,
        capabilityId: "   ",
        input: {},
        status: "queued",
        actorId: TEST_ACTOR_ID,
      });
      expect(created).toBeNull();
    });
  });

  it("create rejects invalid entityId in input", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await jobsRepo.create(tx, {
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        input: { host: "example.com", entityId: "not-a-uuid" },
        status: "queued",
        actorId: TEST_ACTOR_ID,
      });
      expect(created).toBeNull();
    });
  });

  it("update rejects invalid evidenceId in input", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const job = await seedJob(tx, cased.id);
      const updated = await jobsRepo.update(tx, job.id, {
        input: { evidenceId: "bad" },
      });
      expect(updated).toBeNull();
    });
  });

  it("trims padded resultSummary on update", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const job = await seedJob(tx, cased.id);
      const updated = await jobsRepo.update(tx, job.id, {
        resultSummary: "  DNS captured  ",
      });
      expect(updated?.resultSummary).toBe("DNS captured");
    });
  });
});
