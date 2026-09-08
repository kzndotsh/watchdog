import { describe, it, expect } from "vitest";

import { TEST_ACTOR_ID, buildClaimCreateOp, testId } from "@watchdog/test-kit";
import {
  seedCase,
  seedEntity,
  seedEvidence,
  seedJob,
  seedPlaybookRun,
  seedProposal,
  withTestTx,
} from "@watchdog/test-kit/db";

import { proposalsRepo } from "../proposals.repo.ts";

describe("proposalsRepo", () => {
  it("searchPendingForCase matches capability id from linked job", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(21) });
      const job = await seedJob(tx, cased.id, {
        capabilityId: "network.shodan.lookup",
      });
      await seedProposal(
        tx,
        cased.id,
        [buildClaimCreateOp(entity.id, "observed", { id: testId(31) })],
        { summary: "Link domains", jobId: job.id }
      );

      const hits = await proposalsRepo.searchPendingForCase(
        tx,
        cased.id,
        "shodan",
        10
      );
      expect(hits).toHaveLength(1);
      expect(hits[0]?.capabilityId).toBe("network.shodan.lookup");
    });
  });

  it("searchPendingForCase matches humanized capability label", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(24) });
      const job = await seedJob(tx, cased.id, {
        capabilityId: "network.shodan.lookup",
      });
      await seedProposal(
        tx,
        cased.id,
        [buildClaimCreateOp(entity.id, "observed", { id: testId(34) })],
        { summary: null, jobId: job.id }
      );

      const hits = await proposalsRepo.searchPendingForCase(
        tx,
        cased.id,
        "shodan lookup",
        10
      );
      expect(hits).toHaveLength(1);
    });
  });

  it("searchPendingForCase matches patch resource text", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(22) });
      await seedProposal(
        tx,
        cased.id,
        [buildClaimCreateOp(entity.id, "observed", { id: testId(32) })],
        { summary: null, jobId: null }
      );

      const hits = await proposalsRepo.searchPendingForCase(
        tx,
        cased.id,
        "claim",
        10
      );
      expect(hits).toHaveLength(1);
    });
  });

  it("searchPendingForCase matches attached entity name", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(24),
        name: "Epsilon Holdings",
        slug: "epsilon-holdings",
      });
      await seedProposal(
        tx,
        cased.id,
        [buildClaimCreateOp(entity.id, "observed", { id: testId(34) })],
        { summary: null, jobId: null }
      );

      const hits = await proposalsRepo.searchPendingForCase(
        tx,
        cased.id,
        "epsilon holdings",
        10
      );
      expect(hits).toHaveLength(1);
    });
  });

  it("searchPendingForCase matches attached entity notes", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(25),
        name: "Quiet Subject",
        slug: "quiet-subject",
        notes: "Mailbox tied to the fraud thread",
      });
      await seedProposal(
        tx,
        cased.id,
        [buildClaimCreateOp(entity.id, "observed", { id: testId(35) })],
        { summary: null, jobId: null }
      );

      const hits = await proposalsRepo.searchPendingForCase(
        tx,
        cased.id,
        "fraud thread",
        10
      );
      expect(hits).toHaveLength(1);
    });
  });

  it("searchPendingForCase matches attached entity kind display label", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(28),
        name: "Acme Holdings",
        slug: "acme-holdings-org",
        kind: "org",
      });
      await seedProposal(
        tx,
        cased.id,
        [buildClaimCreateOp(entity.id, "observed", { id: testId(36) })],
        { summary: null, jobId: null }
      );

      const hits = await proposalsRepo.searchPendingForCase(
        tx,
        cased.id,
        "Org",
        10
      );
      expect(hits).toHaveLength(1);
    });
  });

  it("searchPendingForCase matches playbook id from linked job", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(23) });
      const run = await seedPlaybookRun(tx, cased.id, {
        playbookId: "host-footprint-lite",
      });
      const job = await seedJob(tx, cased.id, {
        capabilityId: "network.dns.lookup",
        playbookRunId: run.id,
      });
      await seedProposal(
        tx,
        cased.id,
        [buildClaimCreateOp(entity.id, "observed", { id: testId(33) })],
        { summary: null, jobId: job.id }
      );

      const hits = await proposalsRepo.searchPendingForCase(
        tx,
        cased.id,
        "footprint",
        10
      );
      expect(hits).toHaveLength(1);
    });
  });

  it("accepts only a pending proposal and returns null on a second accept", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(20) });
      const { id } = await seedProposal(tx, cased.id, [
        buildClaimCreateOp(entity.id, "Ada observed", { id: testId(30) }),
      ]);

      const first = await proposalsRepo.accept(tx, cased.id, id, {
        decidedBy: TEST_ACTOR_ID,
        decidedAt: new Date(),
      });
      expect(first?.status).toBe("accepted");

      const second = await proposalsRepo.accept(tx, cased.id, id, {
        decidedBy: TEST_ACTOR_ID,
        decidedAt: new Date(),
      });
      expect(second).toBe(null);
    });
  });

  it("accept scopes to the proposal case", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx, { slug: "proposal-case" });
      const other = await seedCase(tx, { slug: "other-case" });
      const entity = await seedEntity(tx, cased.id, { id: testId(22) });
      const { id } = await seedProposal(tx, cased.id, [
        buildClaimCreateOp(entity.id, "Scoped accept", { id: testId(34) }),
      ]);

      expect(
        await proposalsRepo.accept(tx, other.id, id, {
          decidedBy: TEST_ACTOR_ID,
          decidedAt: new Date(),
        })
      ).toBeNull();
    });
  });

  it("create normalizes padded evidenceIds", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(40) });
      const evidence = await seedEvidence(tx, cased.id);
      const created = await proposalsRepo.create(tx, {
        caseId: cased.id,
        status: "pending",
        patch: [buildClaimCreateOp(entity.id, "observed", { id: testId(41) })],
        evidenceIds: [`  ${evidence.id}  `, evidence.id, "  "],
      });
      expect(created).not.toBeNull();
      const row = created
        ? await proposalsRepo.getInCase(tx, cased.id, created.id)
        : null;
      expect(row?.proposal.evidenceIds).toEqual([evidence.id]);
    });
  });

  it("trims padded createdBy on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(52) });
      const created = await proposalsRepo.create(tx, {
        caseId: cased.id,
        status: "pending",
        patch: [buildClaimCreateOp(entity.id, "observed", { id: testId(53) })],
        createdBy: `  ${TEST_ACTOR_ID}  `,
      });
      expect(created).not.toBeNull();
      const row = created
        ? await proposalsRepo.getInCase(tx, cased.id, created.id)
        : null;
      expect(row?.proposal.createdBy).toBe(TEST_ACTOR_ID);
    });
  });

  it("rejects blank createdBy on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(54) });
      const created = await proposalsRepo.create(tx, {
        caseId: cased.id,
        status: "pending",
        patch: [buildClaimCreateOp(entity.id, "observed", { id: testId(55) })],
        createdBy: "   ",
      });
      expect(created).toBeNull();
    });
  });

  it("rejects invalid evidenceIds on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(56) });
      const evidence = await seedEvidence(tx, cased.id);
      const created = await proposalsRepo.create(tx, {
        caseId: cased.id,
        status: "pending",
        patch: [buildClaimCreateOp(entity.id, "observed", { id: testId(57) })],
        evidenceIds: [evidence.id, "not-a-uuid"],
      });
      expect(created).toBeNull();
    });
  });

  it("rejects invalid jobId on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(58) });
      const created = await proposalsRepo.create(tx, {
        caseId: cased.id,
        status: "pending",
        patch: [buildClaimCreateOp(entity.id, "observed", { id: testId(59) })],
        jobId: "not-a-uuid",
      });
      expect(created).toBeNull();
    });
  });

  it("trims padded summary on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(42) });
      const created = await proposalsRepo.create(tx, {
        caseId: cased.id,
        status: "pending",
        patch: [buildClaimCreateOp(entity.id, "observed", { id: testId(43) })],
        summary: "  Link domains  ",
      });
      expect(created).not.toBeNull();
      const row = created
        ? await proposalsRepo.getInCase(tx, cased.id, created.id)
        : null;
      expect(row?.proposal.summary).toBe("Link domains");
    });
  });

  it("trims padded rejectReason on reject", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(44) });
      const { id } = await seedProposal(tx, cased.id, [
        buildClaimCreateOp(entity.id, "observed", { id: testId(45) }),
      ]);
      const rejected = await proposalsRepo.reject(tx, cased.id, id, {
        rejectReason: "  duplicate  ",
        decidedBy: TEST_ACTOR_ID,
        decidedAt: new Date(),
      });
      expect(rejected?.rejectReason).toBe("duplicate");
    });
  });

  it("trims padded decidedBy on accept and reject", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(46) });
      const acceptProposal = await seedProposal(tx, cased.id, [
        buildClaimCreateOp(entity.id, "accept trim", { id: testId(47) }),
      ]);
      const accepted = await proposalsRepo.accept(
        tx,
        cased.id,
        acceptProposal.id,
        {
          decidedBy: `  ${TEST_ACTOR_ID}  `,
          decidedAt: new Date(),
        }
      );
      expect(accepted?.decidedBy).toBe(TEST_ACTOR_ID);

      const rejectProposal = await seedProposal(tx, cased.id, [
        buildClaimCreateOp(entity.id, "reject trim", { id: testId(48) }),
      ]);
      const rejected = await proposalsRepo.reject(
        tx,
        cased.id,
        rejectProposal.id,
        {
          rejectReason: "no",
          decidedBy: `  ${TEST_ACTOR_ID}  `,
          decidedAt: new Date(),
        }
      );
      expect(rejected?.decidedBy).toBe(TEST_ACTOR_ID);
    });
  });

  it("rejects blank decidedBy on accept and reject", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(49) });
      const acceptProposal = await seedProposal(tx, cased.id, [
        buildClaimCreateOp(entity.id, "blank accept", { id: testId(50) }),
      ]);
      expect(
        await proposalsRepo.accept(tx, cased.id, acceptProposal.id, {
          decidedBy: "   ",
          decidedAt: new Date(),
        })
      ).toBeNull();

      const rejectProposal = await seedProposal(tx, cased.id, [
        buildClaimCreateOp(entity.id, "blank reject", { id: testId(51) }),
      ]);
      expect(
        await proposalsRepo.reject(tx, cased.id, rejectProposal.id, {
          rejectReason: "no",
          decidedBy: "   ",
          decidedAt: new Date(),
        })
      ).toBeNull();
    });
  });
});
