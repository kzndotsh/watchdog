import { describe, expect, it } from "vitest";

import {
  applyPatchEffect,
  DomainError,
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

  it("normalizes entity create slugs from patch ops", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entityOp = buildEntityCreateOp("Alpha Corp", "  Alpha Corp  ", "org", {
        id: testId(37),
      });

      await runDomain(
        applyPatchEffect({
          tx,
          caseId: cased.id,
          confidence: "unverified",
          patch: [entityOp],
        })
      );

      const entities = await entitiesRepo.listForCase(tx, cased.id);
      expect(entities.some((row) => row.slug === "alpha-corp")).toBe(true);
    });
  });

  it("trims padded entity ids on claim create patch ops", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(38),
        slug: "claim-target",
      });
      const claimOp = buildClaimCreateOp(entity.id, "Observed host", {
        id: testId(39),
        data: {
          entityId: `  ${entity.id}  `,
          text: "Observed host",
          class: "observation",
        },
      });

      await runDomain(
        applyPatchEffect({
          tx,
          caseId: cased.id,
          confidence: "unverified",
          patch: [claimOp],
        })
      );

      const claims = await claimsRepo.listForEntity(tx, entity.id);
      expect(claims.some((row) => row.text === "Observed host")).toBe(true);
    });
  });

  it("rejects entity upsert when slug belongs to a different id", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const existing = await seedEntity(tx, cased.id, {
        id: testId(60),
        slug: "shared-slug",
      });
      await expect(
        runDomain(
          applyPatchEffect({
            tx,
            caseId: cased.id,
            confidence: "unverified",
            patch: [
              {
                op: "upsert",
                resource: "entity",
                id: testId(61),
                data: {
                  name: "Other",
                  slug: "shared-slug",
                  kind: "person",
                },
              },
            ],
          })
        )
      ).rejects.toSatisfy(
        (error: unknown) => DomainError.is(error) && error.code === "conflict"
      );
      const rows = await entitiesRepo.listForCase(tx, cased.id);
      expect(rows.filter((row) => row.slug === "shared-slug")).toHaveLength(1);
      expect(rows.find((row) => row.slug === "shared-slug")?.id).toBe(
        existing.id
      );
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

  it("normalizes padded identifier type on patch apply", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(43) });
      const createOp = buildIdentifierCreateOp(
        entity.id,
        "  email  ",
        "padded-type@example.com",
        { id: testId(44), data: { platform: "" } }
      );
      await runDomain(
        applyPatchEffect({
          tx,
          caseId: cased.id,
          confidence: "unverified",
          patch: [createOp],
        })
      );
      const identifiers = await identifiersRepo.listForEntity(tx, entity.id);
      expect(
        identifiers.some(
          (row) =>
            row.type === "email" && row.value === "padded-type@example.com"
        )
      ).toBe(true);
    });
  });

  it("upserts an identifier without failing when evidence is already linked", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(46) });
      const evidence = await seedEvidence(tx, cased.id, { label: "proof" });
      const createOp = {
        ...buildIdentifierCreateOp(
          entity.id,
          "email",
          "ada@example.com",
          {
            id: testId(47),
            data: { platform: "", notes: "first" },
          }
        ),
        evidenceIds: [evidence.id],
      };
      await runDomain(
        applyPatchEffect({
          tx,
          caseId: cased.id,
          confidence: "unverified",
          patch: [createOp],
        })
      );
      await runDomain(
        applyPatchEffect({
          tx,
          caseId: cased.id,
          confidence: "possible",
          patch: [
            {
              ...createOp,
              op: "upsert",
              id: testId(48),
              data: { ...createOp.data, notes: "updated" },
            },
          ],
        })
      );

      const identifiers = await identifiersRepo.listForEntity(tx, entity.id);
      const identifier = identifiers.find(
        (row) => row.type === "email" && row.value === "ada@example.com"
      );
      expect(identifier?.notes).toBe("updated");
      const linked = await evidenceLinksRepo.listForIdentifiers(tx, [
        identifier!.id,
      ]);
      expect(linked.get(identifier!.id)).toEqual([evidence.id]);
    });
  });

  it("upserts an edge without failing when evidence is already linked", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const person = await seedEntity(tx, cased.id, {
        id: testId(49),
        kind: "person",
        slug: "ada",
      });
      const peer = await seedEntity(tx, cased.id, {
        id: testId(50),
        kind: "person",
        slug: "bob",
      });
      const evidence = await seedEvidence(tx, cased.id, { label: "proof" });
      const createOp = {
        ...buildEdgeCreateOp(person.id, peer.id, "same_as", {
          id: testId(51),
          data: { notes: "first" },
        }),
        evidenceIds: [evidence.id],
      };
      await runDomain(
        applyPatchEffect({
          tx,
          caseId: cased.id,
          confidence: "unverified",
          patch: [createOp],
        })
      );
      await runDomain(
        applyPatchEffect({
          tx,
          caseId: cased.id,
          confidence: "possible",
          patch: [
            {
              ...createOp,
              op: "upsert",
              id: testId(52),
              data: { ...createOp.data, notes: "updated" },
            },
          ],
        })
      );

      const edges = await edgesRepo.listForEntity(tx, cased.id, person.id);
      const edge = edges.find(
        (row) => row.toId === peer.id && row.predicate === "same_as"
      );
      expect(edge?.notes).toBe("updated");
      const linked = await evidenceLinksRepo.listForEdges(tx, [edge!.id]);
      expect(linked.get(edge!.id)).toEqual([evidence.id]);
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

  it("rejects a self-linked edge", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const person = await seedEntity(tx, cased.id, {
        id: testId(53),
        kind: "person",
        slug: "ada",
      });
      await expect(
        runDomain(
          applyPatchEffect({
            tx,
            caseId: cased.id,
            confidence: "unverified",
            patch: [
              buildEdgeCreateOp(person.id, person.id, "same_as", {
                id: testId(54),
              }),
            ],
          })
        )
      ).rejects.toThrow(/itself/i);
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

  it("stores null entity summary and notes when create patch sends blanks", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entityOp = buildEntityCreateOp("Blank Fields", "blank-fields", "org", {
        id: testId(55),
        data: { name: "Blank Fields", slug: "blank-fields", kind: "org", summary: "   ", notes: "" },
      });
      await runDomain(
        applyPatchEffect({
          tx,
          caseId: cased.id,
          confidence: "unverified",
          patch: [entityOp],
        })
      );
      const created = await entitiesRepo.getInCase(tx, cased.id, testId(55));
      expect(created?.summary).toBeNull();
      expect(created?.notes).toBeNull();
    });
  });

  it("rejects entity update patch when the entity is in another case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const entityB = await seedEntity(tx, caseB.id, {
        id: testId(57),
        slug: "other-case",
      });
      await expect(
        runDomain(
          applyPatchEffect({
            tx,
            caseId: caseA.id,
            confidence: "unverified",
            patch: [
              {
                op: "update",
                resource: "entity",
                id: entityB.id,
                data: { summary: "cross-case write" },
              },
            ],
          })
        )
      ).rejects.toThrow(/Entity not found/i);
      const unchanged = await entitiesRepo.getInCase(tx, caseB.id, entityB.id);
      expect(unchanged?.summary).not.toBe("cross-case write");
    });
  });

  it("clears entity summary on update patch with blank summary", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(56),
        summary: "Lead subject",
      });
      await runDomain(
        applyPatchEffect({
          tx,
          caseId: cased.id,
          confidence: "unverified",
          patch: [
            {
              op: "update",
              resource: "entity",
              id: entity.id,
              data: { summary: "   " },
            },
          ],
        })
      );
      const updated = await entitiesRepo.getInCase(tx, cased.id, entity.id);
      expect(updated?.summary).toBeNull();
    });
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

  it("links shared evidence when ids have surrounding whitespace", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(56) });
      const evidence = await seedEvidence(tx, cased.id);
      const claimId = testId(57);
      await runDomain(applyPatchEffect({
        tx,
        caseId: cased.id,
        confidence: "unverified",
        sharedEvidenceIds: [`  ${evidence.id}  `],
        patch: [
          buildClaimCreateOp(entity.id, "Cited", {
            id: claimId,
            evidenceIds: [`  ${evidence.id}  `],
          }),
        ],
      }));
      const links = await evidenceLinksRepo.listForClaims(tx, [claimId]);
      expect(links.get(claimId)).toEqual([evidence.id]);
    });
  });

  it("rejects per-op evidence ids from another case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const entityA = await seedEntity(tx, caseA.id, { id: testId(70) });
      const foreignEvidence = await seedEvidence(tx, caseB.id);
      const claimId = testId(71);
      await expect(
        runDomain(
          applyPatchEffect({
            tx,
            caseId: caseA.id,
            confidence: "unverified",
            patch: [
              {
                ...buildClaimCreateOp(entityA.id, "Cross-case cite", {
                  id: claimId,
                }),
                evidenceIds: [foreignEvidence.id],
              },
            ],
          })
        )
      ).rejects.toSatisfy(
        (error: unknown) =>
          DomainError.is(error) &&
          error.code === "invalid" &&
          /not in this Case/i.test(error.message)
      );
    });
  });

  it("rejects invalid evidence ids on patch ops", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(58) });
      const claimId = testId(59);
      await expect(
        runDomain(
          applyPatchEffect({
            tx,
            caseId: cased.id,
            confidence: "unverified",
            patch: [
              {
                ...buildClaimCreateOp(entity.id, "Bad cite", { id: claimId }),
                evidenceIds: ["not-a-uuid"],
              },
            ],
          })
        )
      ).rejects.toSatisfy(
        (error: unknown) =>
          DomainError.is(error) &&
          error.code === "invalid" &&
          error.message === "One or more Evidence ids are invalid"
      );
    });
  });

  it("seeds default questions when patch creates a person entity", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const personId = testId(55);
      await runDomain(applyPatchEffect({
        tx,
        caseId: cased.id,
        confidence: "unverified",
        patch: [
          buildEntityCreateOp("Patch Person", "patch-person", "person", {
            id: personId,
          }),
        ],
      }));
      const questions = await questionsRepo.listForEntity(tx, personId);
      expect(questions.length).toBeGreaterThan(0);
    });
  });
});
