import { describe, expect, it } from "vitest";

import {
  applyPatchEffect,
  runDomain
} from "@watchdog/core";
import {
  claimsRepo,
  db,
  edgesRepo,
  entitiesRepo,
  evidenceLinksRepo,
  eventsRepo,
  identifiersRepo,
  questionsRepo,
} from "@watchdog/db";
import {
  buildClaimCreateOp,
  buildEdgeCreateOp,
  buildEntityCreateOp,
  buildEventCreateOp,
  buildIdentifierCreateOp,
  buildQuestionCreateOp,
  testId,
} from "@watchdog/test-kit";
import {
  seedCase,
  seedEntity,
  seedEvidence,
  withTestTx,
} from "@watchdog/test-kit/db";

describe("applyPatch", () => {
  it("persists create ops for every patch resource", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(20),
        name: "Ada Lovelace",
        slug: "ada-lovelace",
      });

      const claimOp = buildClaimCreateOp(entity.id, "Ada observed a host", {
        id: testId(30),
      });
      const identifierOp = buildIdentifierCreateOp(
        entity.id,
        "email",
        "ada@example.com",
        { id: testId(31), data: { platform: "" } }
      );
      const questionOp = buildQuestionCreateOp(
        entity.id,
        "Where does Ada live?",
        { id: testId(32) }
      );
      const eventOp = buildEventCreateOp(entity.id, "1815-12-10", "Born", {
        id: testId(33),
      });
      const entityOp = buildEntityCreateOp("New Person", "new-person", "person", {
        id: testId(34),
      });
      const peer = await seedEntity(tx, cased.id, {
        id: testId(35),
        name: "Peer",
        slug: "peer",
      });
      const edgeOp = buildEdgeCreateOp(entity.id, peer.id, "same_as", {
        id: testId(36),
      });

      await runDomain(applyPatchEffect({
        tx,
        caseId: cased.id,
        confidence: "unverified",
        patch: [claimOp, identifierOp, questionOp, eventOp, entityOp, edgeOp],
      }));

      const claims = await claimsRepo.listForEntity(tx, entity.id);
      expect(claims.some((row) => row.text === "Ada observed a host")).toBe(
        true
      );

      const identifiers = await identifiersRepo.listForEntity(tx, entity.id);
      expect(
        identifiers.some(
          (row) => row.type === "email" && row.value === "ada@example.com"
        )
      ).toBe(true);

      const questions = await questionsRepo.listForEntity(tx, entity.id);
      expect(questions.some((row) => row.text === "Where does Ada live?")).toBe(
        true
      );

      const events = await eventsRepo.listForEntity(tx, entity.id);
      expect(events.some((row) => row.what === "Born")).toBe(true);

      const entities = await entitiesRepo.listForCase(tx, cased.id);
      expect(entities.some((row) => row.slug === "new-person")).toBe(true);

      const edges = await edgesRepo.listForEntity(tx, cased.id, entity.id);
      expect(
        edges.some(
          (row) => row.fromId === entity.id && row.predicate === "same_as"
        )
      ).toBe(true);
    });
  });

  it("upserts an identifier on the natural key instead of inserting a second row", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(40) });
      const createOp = buildIdentifierCreateOp(
        entity.id,
        "email",
        "ada@example.com",
        { id: testId(41), data: { platform: "", notes: "first" } }
      );
      await runDomain(applyPatchEffect({
        tx,
        caseId: cased.id,
        confidence: "unverified",
        patch: [createOp],
      }));
      await runDomain(applyPatchEffect({
        tx,
        caseId: cased.id,
        confidence: "possible",
        patch: [
          {
            ...createOp,
            op: "upsert",
            id: testId(42),
            data: { ...createOp.data, notes: "updated" },
          },
        ],
      }));
      const identifiers = await identifiersRepo.listForEntity(tx, entity.id);
      const matches = identifiers.filter(
        (row) => row.type === "email" && row.value === "ada@example.com"
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]?.notes).toBe("updated");
      expect(matches[0]?.confidence).toBe("possible");
    });
  });

  it("rejects a handle without platform", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(43) });
      await expect(
        runDomain(applyPatchEffect({
          tx,
          caseId: cased.id,
          confidence: "unverified",
          patch: [
            buildIdentifierCreateOp(entity.id, "handle", "ada", {
              id: testId(44),
              data: { platform: "" },
            }),
          ],
        }))
      ).rejects.toThrow(/platform/i);
    });
  });

  it("rejects a kind-illegal edge", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const person = await seedEntity(tx, cased.id, {
        id: testId(45),
        kind: "person",
        slug: "ada",
      });
      const other = await seedEntity(tx, cased.id, {
        id: testId(46),
        kind: "person",
        name: "Peer",
        slug: "peer",
      });
      await expect(
        runDomain(applyPatchEffect({
          tx,
          caseId: cased.id,
          confidence: "unverified",
          patch: [
            buildEdgeCreateOp(person.id, other.id, "primary_domain", {
              id: testId(47),
            }),
          ],
        }))
      ).rejects.toThrow(/not allowed/i);
    });
  });

  it("requires confidence for a claim", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(48) });
      await expect(
        runDomain(applyPatchEffect({
          tx,
          caseId: cased.id,
          patch: [
            buildClaimCreateOp(entity.id, "Needs confidence", {
              id: testId(49),
            }),
          ],
        }))
      ).rejects.toThrow(/confidence/i);
    });
  });

  it("rejects confirmed without evidence", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(55) });
      await expect(
        runDomain(applyPatchEffect({
          tx,
          caseId: cased.id,
          confidence: "confirmed",
          patch: [
            buildClaimCreateOp(entity.id, "Needs evidence", {
              id: testId(56),
            }),
          ],
        }))
      ).rejects.toThrow(/confirmed requires/i);
    });
  });

  it("rolls back the first op when a later op fails and applyPatch owns the TX", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(50) });
    await expect(
      runDomain(applyPatchEffect({
        caseId: cased.id,
        confidence: "unverified",
        patch: [
          buildClaimCreateOp(entity.id, "Should roll back", { id: testId(51) }),
          buildIdentifierCreateOp(entity.id, "handle", "ada", {
            id: testId(52),
            data: { platform: "" },
          }),
        ],
      }))
    ).rejects.toThrow(/platform/i);

    const claims = await claimsRepo.listForEntity(db, entity.id);
    expect(claims.some((row) => row.text === "Should roll back")).toBe(false);
  });

  it("links shared evidence onto the created claim", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(53) });
      const evidence = await seedEvidence(tx, cased.id);
      const claimId = testId(54);
      await runDomain(applyPatchEffect({
        tx,
        caseId: cased.id,
        confidence: "unverified",
        sharedEvidenceIds: [evidence.id],
        patch: [buildClaimCreateOp(entity.id, "Cited", { id: claimId })],
      }));
      const links = await evidenceLinksRepo.listForClaims(tx, [claimId]);
      expect(links.get(claimId)).toEqual([evidence.id]);
    });
  });
});
