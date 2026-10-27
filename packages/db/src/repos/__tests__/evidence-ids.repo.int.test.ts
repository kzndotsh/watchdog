import { describe, expect, it } from "vitest";

import { jobList } from "@watchdog/schemas/jobs";
import { untrustedCaseId } from "@watchdog/schemas/testing";
import {
  expectPostgresRefusal,
  PG_FOREIGN_KEY_VIOLATION,
  seedCase,
  seedEvidence,
  seedJob,
  seedProposal,
  withTestTx,
} from "@watchdog/test-db";

import { evidenceLinksRepo } from "../evidence-links.repo.ts";
import { jobListRepo } from "../job-list.repo.ts";
import { jobsRepo } from "../jobs.repo.ts";
import { proposalListRepo } from "../proposal-list.repo.ts";
import { proposalsRepo } from "../proposals.repo.ts";

/*
 * Proposals and Jobs cite Evidence through `proposal_evidence` / `job_evidence` (#302), but their
 * rows still carry `evidenceIds` for readers: in citation order, deduplicated, and always an array.
 */

describe("jobsRepo evidenceIds", () => {
  it("keeps the order a Job landed its Evidence in, without repeats", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const first = await seedEvidence(tx, cased.id);
      const second = await seedEvidence(tx, cased.id);
      const job = await seedJob(tx, cased.id, {
        evidenceIds: [second.id, first.id, second.id],
      });
      expect(job.evidenceIds).toEqual([second.id, first.id]);
      const reread = await jobsRepo.get(tx, job.id);
      expect(reread?.evidenceIds).toEqual([second.id, first.id]);
      const listed = await jobListRepo.page(
        tx,
        { caseId: cased.id },
        jobList.queryOf({}),
        { limit: 10, after: undefined }
      );
      expect(listed[0]?.evidenceIds).toEqual([second.id, first.id]);
    });
  });

  it("reads [] for a Job with no Evidence", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const job = await seedJob(tx, cased.id);
      expect(job.evidenceIds).toEqual([]);
      expect((await jobsRepo.get(tx, job.id))?.evidenceIds).toEqual([]);
    });
  });

  it("replaces the list on update, clears it with null, and leaves it alone otherwise", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const first = await seedEvidence(tx, cased.id);
      const second = await seedEvidence(tx, cased.id);
      const job = await seedJob(tx, cased.id, { evidenceIds: [first.id] });

      const replaced = await jobsRepo.updateInCase(tx, cased.id, job.id, {
        evidenceIds: [second.id, first.id],
      });
      expect(replaced?.evidenceIds).toEqual([second.id, first.id]);

      const touched = await jobsRepo.update(tx, job.id, {
        resultSummary: "done",
      });
      expect(touched?.evidenceIds).toEqual([second.id, first.id]);

      const cleared = await jobsRepo.update(tx, job.id, { evidenceIds: null });
      expect(cleared?.evidenceIds).toEqual([]);
      expect((await jobsRepo.get(tx, job.id))?.evidenceIds).toEqual([]);
    });
  });

  it("updates nothing and links nothing when the Job is not in the Case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const evidenceB = await seedEvidence(tx, caseB.id);
      const jobA = await seedJob(tx, caseA.id);
      const updated = await jobsRepo.updateInCase(tx, caseB.id, jobA.id, {
        evidenceIds: [evidenceB.id],
      });
      expect(updated).toBeNull();
      expect((await jobsRepo.get(tx, jobA.id))?.evidenceIds).toEqual([]);
    });
  });

  it("refuses Evidence from another Case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const evidenceB = await seedEvidence(tx, caseB.id);
      await expectPostgresRefusal(
        seedJob(tx, caseA.id, { evidenceIds: [evidenceB.id] }),
        {
          code: PG_FOREIGN_KEY_VIOLATION,
          constraint: "job_evidence_evidence_id_case_id_fk",
        }
      );
    });
  });

  it("keeps the links when replaceJob is given a bad Case id", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const first = await seedEvidence(tx, cased.id);
      const job = await seedJob(tx, cased.id, { evidenceIds: [first.id] });
      const replaced = await evidenceLinksRepo.replaceJob(
        tx,
        untrustedCaseId("not-a-uuid"),
        job.id,
        []
      );
      expect(replaced).toBeNull();
      expect((await jobsRepo.get(tx, job.id))?.evidenceIds).toEqual([first.id]);
    });
  });

  it("returns null for an id that is not a UUID", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const job = await seedJob(tx, cased.id);
      expect(
        await jobsRepo.update(tx, job.id, { evidenceIds: ["not-a-uuid"] })
      ).toBeNull();
    });
  });
});

describe("proposalsRepo evidenceIds", () => {
  it("returns the cited Evidence in citation order on every read", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const first = await seedEvidence(tx, cased.id);
      const second = await seedEvidence(tx, cased.id);
      const { id } = await seedProposal(tx, cased.id, [], {
        evidenceIds: [second.id, first.id],
      });
      const got = await proposalsRepo.getInCase(tx, cased.id, id);
      expect(got?.proposal.evidenceIds).toEqual([second.id, first.id]);
      const locked = await proposalsRepo.lockInCase(tx, cased.id, id);
      expect(locked?.evidenceIds).toEqual([second.id, first.id]);
      const listed = await proposalListRepo.byIds(tx, { caseId: cased.id }, [
        id,
      ]);
      expect(listed[0]?.evidenceIds).toEqual([second.id, first.id]);
      const accepted = await proposalsRepo.accept(tx, cased.id, id, {
        decidedBy: "a",
        decidedAt: new Date(),
      });
      expect(accepted?.evidenceIds).toEqual([second.id, first.id]);
    });
  });

  it("reads [] for a Proposal that cites nothing", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const { id } = await seedProposal(tx, cased.id, []);
      const got = await proposalsRepo.getInCase(tx, cased.id, id);
      expect(got?.proposal.evidenceIds).toEqual([]);
    });
  });

  it("refuses Evidence from another Case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const evidenceB = await seedEvidence(tx, caseB.id);
      await expectPostgresRefusal(
        seedProposal(tx, caseA.id, [], { evidenceIds: [evidenceB.id] }),
        {
          code: PG_FOREIGN_KEY_VIOLATION,
          constraint: "proposal_evidence_evidence_id_case_id_fk",
        }
      );
    });
  });
});
