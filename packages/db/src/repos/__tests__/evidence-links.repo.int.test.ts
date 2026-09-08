import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";
import {
  seedCase,
  seedEntity,
  seedEvidence,
  withTestTx,
} from "@watchdog/test-kit/db";

import { claimsRepo } from "../claims.repo.ts";
import { evidenceLinksRepo } from "../evidence-links.repo.ts";

describe("evidenceLinksRepo", () => {
  it("replaceClaim drops old ids and keeps the new set", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(20) });
      const first = await seedEvidence(tx, cased.id, { label: "a" });
      const second = await seedEvidence(tx, cased.id, { label: "b" });
      const claim = await claimsRepo.create(tx, {
        entityId: entity.id,
        text: "cited",
        class: "observation",
        confidence: "unverified",
      });
      if (!claim) throw new Error("claim");

      await evidenceLinksRepo.linkClaim(tx, claim.id, [first.id]);
      const replaced = await evidenceLinksRepo.replaceClaim(tx, claim.id, [
        second.id,
      ]);
      expect(replaced).toEqual([second.id]);

      const listed = await evidenceLinksRepo.listForClaims(tx, [claim.id]);
      expect(listed.get(claim.id)).toEqual([second.id]);
    });
  });

  it("linkIdentifier ignores duplicate evidence links", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(21) });
      const evidence = await seedEvidence(tx, cased.id, { label: "proof" });
      const { identifiersRepo } = await import("../identifiers.repo.ts");
      const identifier = await identifiersRepo.create(tx, {
        id: testId(22),
        entityId: entity.id,
        type: "email",
        platform: "custom",
        value: "a@b.test",
        confidence: "unverified",
        status: "unknown",
        notes: null,
      });
      if (!identifier) throw new Error("identifier");

      await evidenceLinksRepo.linkIdentifier(tx, identifier.id, [evidence.id]);
      await evidenceLinksRepo.linkIdentifier(tx, identifier.id, [evidence.id]);

      const listed = await evidenceLinksRepo.listForIdentifiers(tx, [
        identifier.id,
      ]);
      expect(listed.get(identifier.id)).toEqual([evidence.id]);
    });
  });

  it("linkClaim ignores duplicate evidence links", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(23) });
      const evidence = await seedEvidence(tx, cased.id, { label: "proof" });
      const claim = await claimsRepo.create(tx, {
        entityId: entity.id,
        text: "cited",
        class: "observation",
        confidence: "unverified",
      });
      if (!claim) throw new Error("claim");

      await evidenceLinksRepo.linkClaim(tx, claim.id, [evidence.id]);
      await evidenceLinksRepo.linkClaim(tx, claim.id, [evidence.id]);

      const listed = await evidenceLinksRepo.listForClaims(tx, [claim.id]);
      expect(listed.get(claim.id)).toEqual([evidence.id]);
    });
  });

  it("linkEdge ignores duplicate evidence links", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const from = await seedEntity(tx, cased.id, {
        id: testId(24),
        slug: "edge-from",
      });
      const to = await seedEntity(tx, cased.id, {
        id: testId(25),
        slug: "edge-to",
        name: "Edge To",
      });
      const evidence = await seedEvidence(tx, cased.id, { label: "proof" });
      const { edgesRepo } = await import("../edges.repo.ts");
      const edge = await edgesRepo.create(tx, {
        fromId: from.id,
        toId: to.id,
        predicate: "same_as",
        confidence: "unverified",
        notes: null,
      });
      if (!edge) throw new Error("edge");

      await evidenceLinksRepo.linkEdge(tx, edge.id, [evidence.id]);
      await evidenceLinksRepo.linkEdge(tx, edge.id, [evidence.id]);

      const listed = await evidenceLinksRepo.listForEdges(tx, [edge.id]);
      expect(listed.get(edge.id)).toEqual([evidence.id]);
    });
  });

  it("listForClaims trims padded parent ids", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(26) });
      const evidence = await seedEvidence(tx, cased.id, { label: "proof" });
      const claim = await claimsRepo.create(tx, {
        entityId: entity.id,
        text: "cited",
        class: "observation",
        confidence: "unverified",
      });
      if (!claim) throw new Error("claim");

      await evidenceLinksRepo.linkClaim(tx, claim.id, [evidence.id]);
      const listed = await evidenceLinksRepo.listForClaims(tx, [
        `  ${claim.id}  `,
      ]);
      expect(listed.get(claim.id)).toEqual([evidence.id]);
    });
  });

  it("linkClaim rejects invalid evidence ids", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(27) });
      const claim = await claimsRepo.create(tx, {
        entityId: entity.id,
        text: "cited",
        class: "observation",
        confidence: "unverified",
      });
      if (!claim) throw new Error("claim");

      const linked = await evidenceLinksRepo.linkClaim(tx, claim.id, [
        "not-a-uuid",
      ]);
      expect(linked).toBe(false);

      const listed = await evidenceLinksRepo.listForClaims(tx, [claim.id]);
      expect(listed.get(claim.id)).toBeUndefined();
    });
  });

  it("replaceClaim rejects invalid evidence ids without clearing links", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, { id: testId(28) });
      const evidence = await seedEvidence(tx, cased.id, { label: "proof" });
      const claim = await claimsRepo.create(tx, {
        entityId: entity.id,
        text: "cited",
        class: "observation",
        confidence: "unverified",
      });
      if (!claim) throw new Error("claim");

      await evidenceLinksRepo.linkClaim(tx, claim.id, [evidence.id]);
      const replaced = await evidenceLinksRepo.replaceClaim(tx, claim.id, [
        evidence.id,
        "not-a-uuid",
      ]);
      expect(replaced).toBe(null);

      const listed = await evidenceLinksRepo.listForClaims(tx, [claim.id]);
      expect(listed.get(claim.id)).toEqual([evidence.id]);
    });
  });
});
