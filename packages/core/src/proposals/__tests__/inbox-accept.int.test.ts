import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  acceptProposalEffect,
  createAgentProposalEffect,
  rejectProposalEffect,
  runDomain,
} from "@watchdog/core";
import {
  claimsRepo,
  db,
  evidenceLinksRepo,
  evidenceRepo,
  findingSuppressionsRepo,
  identifiersRepo,
  proposalsRepo,
} from "@watchdog/db";
import { fingerprintPatchOp } from "@watchdog/schemas";
import {
  TEST_ACTOR_ID,
  buildClaimCreateOp,
  buildIdentifierCreateOp,
  testId,
  TEST_ORGANIZATION_ID,
} from "@watchdog/test-kit";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedIdentifier,
  seedProposal,
} from "@watchdog/test-kit/db";

describe("acceptProposal", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("accepts a pending claim proposal as unverified", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildClaimCreateOp(entity.id, "Ada observed a host", { id: testId(30) }),
    ]);

    const accepted = await runDomain(
      acceptProposalEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        proposalId,
        actorId: TEST_ACTOR_ID,
        confidence: "unverified",
      })
    );
    expect(accepted.status).toBe("accepted");

    const claims = await claimsRepo.listForEntity(db, entity.id);
    expect(claims.some((row) => row.text === "Ada observed a host")).toBe(true);
  });

  it("blocks confirmed without evidence", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(21) });
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildClaimCreateOp(entity.id, "Needs evidence", { id: testId(35) }),
    ]);

    await expect(
      runDomain(
        acceptProposalEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          proposalId,
          actorId: TEST_ACTOR_ID,
          confidence: "confirmed",
        })
      )
    ).rejects.toThrow(/confirmed requires/i);

    const row = await proposalsRepo.getInCase(db, cased.id, proposalId);
    expect(row?.proposal.status).toBe("pending");
  });

  it("accepts an identifier that already exists on another entity", async () => {
    const cased = await seedCase(db);
    const entityA = await seedEntity(db, cased.id, {
      id: testId(22),
      name: "Entity A",
      slug: "entity-a",
    });
    const entityB = await seedEntity(db, cased.id, {
      id: testId(23),
      name: "Entity B",
      slug: "entity-b",
    });
    await seedIdentifier(db, entityA.id, {
      type: "email",
      value: "ada@example.com",
      platform: "",
    });
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildIdentifierCreateOp(entityB.id, "email", "ada@example.com", {
        id: testId(36),
        data: { platform: "" },
      }),
    ]);

    const accepted = await runDomain(
      acceptProposalEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        proposalId,
        actorId: TEST_ACTOR_ID,
        confidence: "unverified",
      })
    );
    expect(accepted.status).toBe("accepted");

    const onB = await identifiersRepo.listForEntity(db, entityB.id);
    expect(
      onB.some((row) => row.type === "email" && row.value === "ada@example.com")
    ).toBe(true);
  });

  it("rejects a pending proposal", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(24) });
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildClaimCreateOp(entity.id, "Will reject", { id: testId(37) }),
    ]);

    const rejected = await runDomain(
      rejectProposalEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        proposalId,
        actorId: TEST_ACTOR_ID,
        reason: "not this",
      })
    );
    expect(rejected.status).toBe("rejected");
  });

  it("records reject fingerprints so the next propose is a conflict", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(26) });
    const op = buildClaimCreateOp(entity.id, "Suppressed later", {
      id: testId(39),
    });
    const { id: proposalId } = await seedProposal(db, cased.id, [op]);

    await runDomain(
      rejectProposalEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        proposalId,
        actorId: TEST_ACTOR_ID,
      })
    );

    const fp = fingerprintPatchOp(op);
    expect(fp).toBeTruthy();
    if (fp === null) throw new Error("expected fingerprint");
    const stored = await findingSuppressionsRepo.listFingerprints(
      db,
      cased.id,
      [fp]
    );
    expect(stored).toContain(fp);

    await expect(
      runDomain(
        createAgentProposalEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          actorId: TEST_ACTOR_ID,
          patch: [
            buildClaimCreateOp(entity.id, "Suppressed later", {
              id: testId(60),
            }),
          ],
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "conflict"
    );

    const listed = await proposalsRepo.listForCase(db, cased.id);
    expect(
      listed.filter((row) => row.proposal.status === "pending")
    ).toHaveLength(0);
  });

  it("conflicts when accepting an already accepted proposal", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(27) });
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildClaimCreateOp(entity.id, "Once", { id: testId(61) }),
    ]);
    await runDomain(
      acceptProposalEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        proposalId,
        actorId: TEST_ACTOR_ID,
        confidence: "unverified",
      })
    );
    await expect(
      runDomain(
        acceptProposalEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          proposalId,
          actorId: TEST_ACTOR_ID,
          confidence: "unverified",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "conflict"
    );
  });

  it("accepts confirmed when shared evidence is present", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(28) });
    const evidence = await seedEvidence(db, cased.id);
    const claimId = testId(62);
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildClaimCreateOp(entity.id, "Cited claim", { id: claimId }),
    ]);

    const accepted = await runDomain(
      acceptProposalEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        proposalId,
        actorId: TEST_ACTOR_ID,
        confidence: "confirmed",
        sharedEvidenceIds: [evidence.id],
      })
    );
    expect(accepted.status).toBe("accepted");
    const links = await evidenceLinksRepo.listForClaims(db, [claimId]);
    expect(links.get(claimId)).toEqual([evidence.id]);
  });

  it("creates attestation evidence from the accept summary paste", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(29) });
    const claimId = testId(63);
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildClaimCreateOp(entity.id, "Attested", { id: claimId }),
    ]);

    await runDomain(
      acceptProposalEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        proposalId,
        actorId: TEST_ACTOR_ID,
        confidence: "unverified",
        attestationText: "I saw this in WHOIS",
      })
    );

    const evidence = await evidenceRepo.listForCase(db, cased.id);
    const note = evidence.find((row) => row.text === "I saw this in WHOIS");
    expect(note).toBeTruthy();
    if (!note) throw new Error("expected attestation");
    const links = await evidenceLinksRepo.listForClaims(db, [claimId]);
    expect(links.get(claimId)).toContain(note.id);
  });

  describe("concurrency", () => {
    it("lets only one of two concurrent accepts succeed", async () => {
      const cased = await seedCase(db);
      const entity = await seedEntity(db, cased.id, { id: testId(25) });
      const { id: proposalId } = await seedProposal(db, cased.id, [
        buildClaimCreateOp(entity.id, "Race claim", { id: testId(38) }),
      ]);

      const input = {
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        proposalId,
        actorId: TEST_ACTOR_ID,
        confidence: "unverified" as const,
      };
      const results = await Promise.allSettled([
        runDomain(acceptProposalEffect(input)),
        runDomain(acceptProposalEffect(input)),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const firstRejected = rejected[0];
      if (firstRejected?.status !== "rejected") {
        throw new TypeError("expected one Accept to reject");
      }
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- PromiseRejectedResult.reason is any
      const reason: unknown = firstRejected.reason;
      expect(DomainError.is(reason)).toBe(true);
      if (!DomainError.is(reason)) return;
      expect(reason.code).toBe("conflict");
    });

    it("lets only one of accept and reject win", async () => {
      const cased = await seedCase(db);
      const entity = await seedEntity(db, cased.id, { id: testId(70) });
      const { id: proposalId } = await seedProposal(db, cased.id, [
        buildClaimCreateOp(entity.id, "Half apply", { id: testId(71) }),
      ]);

      const results = await Promise.allSettled([
        runDomain(
          acceptProposalEffect({
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            proposalId,
            actorId: TEST_ACTOR_ID,
            confidence: "unverified",
          })
        ),
        runDomain(
          rejectProposalEffect({
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            proposalId,
            actorId: TEST_ACTOR_ID,
          })
        ),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);

      const row = await proposalsRepo.getInCase(db, cased.id, proposalId);
      expect(
        row?.proposal.status === "accepted" ||
          row?.proposal.status === "rejected"
      ).toBe(true);
      const claims = await claimsRepo.listForEntity(db, entity.id);
      const wrote = claims.some((c) => c.text === "Half apply");
      if (row?.proposal.status === "accepted") {
        expect(wrote).toBe(true);
      } else {
        expect(wrote).toBe(false);
      }
    });
  });
});
