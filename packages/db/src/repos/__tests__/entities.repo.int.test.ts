import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";
import { seedCase, seedEntity, withTestTx } from "@watchdog/test-kit/db";

import { edgesRepo } from "../edges.repo.ts";
import { entitiesRepo } from "../entities.repo.ts";

describe("entitiesRepo", () => {
  it("searchForCase matches a name substring", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await seedEntity(tx, cased.id, {
        id: testId(20),
        name: "Ada Lovelace",
        slug: "ada-lovelace",
      });
      const hits = await entitiesRepo.searchForCase(tx, cased.id, "Ada", 10);
      expect(hits.some((row) => row.name === "Ada Lovelace")).toBe(true);
    });
  });

  it("searchForCase matches entity slug via slugified query", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await seedEntity(tx, cased.id, {
        id: testId(21),
        name: "Quiet Subject",
        slug: "unnamed-host",
      });
      const hits = await entitiesRepo.searchForCase(
        tx,
        cased.id,
        "Unnamed Host",
        10
      );
      expect(hits.some((row) => row.slug === "unnamed-host")).toBe(true);
    });
  });

  it("searchForCase matches entity notes", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await seedEntity(tx, cased.id, {
        id: testId(24),
        name: "Quiet Subject",
        slug: "quiet-subject",
        notes: "Former contractor at Acme Labs",
      });
      const hits = await entitiesRepo.searchForCase(
        tx,
        cased.id,
        "acme labs",
        10
      );
      expect(hits.some((row) => row.slug === "quiet-subject")).toBe(true);
    });
  });

  it("searchForCase matches entity kind display label", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await seedEntity(tx, cased.id, {
        id: testId(25),
        name: "Acme Holdings",
        slug: "acme-holdings",
        kind: "org",
      });
      const hits = await entitiesRepo.searchForCase(tx, cased.id, "Org", 10);
      expect(hits.some((row) => row.slug === "acme-holdings")).toBe(true);
    });
  });

  it("searchForCase matches entity kind raw value", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await seedEntity(tx, cased.id, {
        id: testId(26),
        name: "Acme Holdings",
        slug: "acme-holdings-raw",
        kind: "org",
      });
      const hits = await entitiesRepo.searchForCase(tx, cased.id, "org", 10);
      expect(hits.some((row) => row.slug === "acme-holdings-raw")).toBe(true);
    });
  });

  it("searchForCase matches a connection peer name", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const subject = await seedEntity(tx, cased.id, {
        id: testId(26),
        name: "Alice Subject",
        slug: "alice-subject",
      });
      const peer = await seedEntity(tx, cased.id, {
        id: testId(27),
        name: "Bob Corp",
        slug: "bob-corp",
      });
      const edge = await edgesRepo.create(tx, {
        fromId: subject.id,
        toId: peer.id,
        predicate: "owns",
        confidence: "unverified",
        notes: null,
      });
      if (!edge) throw new Error("edge");

      const hits = await entitiesRepo.searchForCase(
        tx,
        cased.id,
        "bob corp",
        10
      );
      expect(hits.some((row) => row.slug === "alice-subject")).toBe(true);
      expect(hits.some((row) => row.slug === "bob-corp")).toBe(true);
    });
  });

  it("searchForCase matches connection edge notes", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const subject = await seedEntity(tx, cased.id, {
        id: testId(30),
        name: "Alice Subject",
        slug: "alice-subject-edge-notes",
      });
      const peer = await seedEntity(tx, cased.id, {
        id: testId(31),
        name: "Quiet Peer",
        slug: "quiet-peer-edge-notes",
      });
      const edge = await edgesRepo.create(tx, {
        fromId: subject.id,
        toId: peer.id,
        predicate: "related_to",
        confidence: "unverified",
        notes: "Shared registrar contact",
      });
      if (!edge) throw new Error("edge");

      const hits = await entitiesRepo.searchForCase(
        tx,
        cased.id,
        "registrar contact",
        10
      );
      expect(hits.some((row) => row.slug === "alice-subject-edge-notes")).toBe(
        true
      );
      expect(hits.some((row) => row.slug === "quiet-peer-edge-notes")).toBe(
        true
      );
    });
  });

  it("searchForCase matches a connection peer notes", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const subject = await seedEntity(tx, cased.id, {
        id: testId(28),
        name: "Alice Subject",
        slug: "alice-subject",
      });
      const peer = await seedEntity(tx, cased.id, {
        id: testId(29),
        name: "Quiet Peer",
        slug: "quiet-peer",
        notes: "Mailbox tied to the fraud thread",
      });
      const edge = await edgesRepo.create(tx, {
        fromId: subject.id,
        toId: peer.id,
        predicate: "owns",
        confidence: "unverified",
        notes: null,
      });
      if (!edge) throw new Error("edge");

      const hits = await entitiesRepo.searchForCase(
        tx,
        cased.id,
        "fraud thread",
        10
      );
      expect(hits.some((row) => row.slug === "alice-subject")).toBe(true);
      expect(hits.some((row) => row.slug === "quiet-peer")).toBe(true);
    });
  });

  it("searchForCase matches a connection peer kind display label", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const subject = await seedEntity(tx, cased.id, {
        id: testId(32),
        name: "Alice Subject",
        slug: "alice-subject-peer-kind",
      });
      const peer = await seedEntity(tx, cased.id, {
        id: testId(33),
        name: "Quiet Corp",
        slug: "quiet-corp",
        kind: "org",
      });
      const edge = await edgesRepo.create(tx, {
        fromId: subject.id,
        toId: peer.id,
        predicate: "owns",
        confidence: "unverified",
        notes: null,
      });
      if (!edge) throw new Error("edge");

      const hits = await entitiesRepo.searchForCase(tx, cased.id, "Org", 10);
      expect(hits.some((row) => row.slug === "alice-subject-peer-kind")).toBe(
        true
      );
    });
  });

  it("updateInCase rejects updates outside the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const entityB = await seedEntity(tx, caseB.id, {
        id: testId(58),
        name: "Other case",
        slug: "other-case-update",
      });
      const updated = await entitiesRepo.updateInCase(
        tx,
        caseA.id,
        entityB.id,
        { summary: "cross-case" }
      );
      expect(updated).toBeNull();
      const unchanged = await entitiesRepo.getInCase(tx, caseB.id, entityB.id);
      expect(unchanged?.summary).toBeNull();
    });
  });

  it("delete removes the entity row", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(21),
        name: "To Delete",
        slug: "to-delete",
      });
      expect(await entitiesRepo.delete(tx, entity.id)).toBe(true);
      expect(await entitiesRepo.getInCase(tx, cased.id, entity.id)).toBeNull();
      expect(await entitiesRepo.delete(tx, entity.id)).toBe(false);
    });
  });

  it("deleteInCase rejects deletes outside the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const entityB = await seedEntity(tx, caseB.id, {
        id: testId(59),
        name: "Other case",
        slug: "other-case-delete",
      });
      expect(await entitiesRepo.deleteInCase(tx, caseA.id, entityB.id)).toBe(
        false
      );
      expect(
        await entitiesRepo.getInCase(tx, caseB.id, entityB.id)
      ).not.toBeNull();
      expect(await entitiesRepo.deleteInCase(tx, caseB.id, entityB.id)).toBe(
        true
      );
      expect(await entitiesRepo.getInCase(tx, caseB.id, entityB.id)).toBeNull();
    });
  });

  it("trims padded case and entity ids on scoped lookups", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(60),
        name: "Padded Lookup",
        slug: "padded-lookup",
      });

      const row = await entitiesRepo.getInCase(
        tx,
        `  ${cased.id}  `,
        `  ${entity.id}  `
      );
      expect(row?.id).toBe(entity.id);

      const updated = await entitiesRepo.updateInCase(
        tx,
        `  ${cased.id}  `,
        `  ${entity.id}  `,
        { summary: "trimmed" }
      );
      expect(updated?.summary).toBe("trimmed");
    });
  });

  it("trims padded entity name and slug on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await entitiesRepo.create(tx, {
        caseId: cased.id,
        kind: "person",
        name: "  Ada Lovelace  ",
        slug: "  ada-lovelace  ",
      });
      expect(created?.name).toBe("Ada Lovelace");
      expect(created?.slug).toBe("ada-lovelace");
    });
  });

  it("rejects blank entity name on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await entitiesRepo.create(tx, {
        caseId: cased.id,
        kind: "person",
        name: "   ",
        slug: "blank-name",
      });
      expect(created).toBeNull();
    });
  });

  it("listSlugsInCase matches padded slug inputs", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await seedEntity(tx, cased.id, {
        id: testId(26),
        name: "Slug Match",
        slug: "slug-match",
      });
      const rows = await entitiesRepo.listSlugsInCase(tx, cased.id, [
        "  slug-match  ",
      ]);
      expect(rows).toEqual([{ slug: "slug-match" }]);
    });
  });

  it("getByCaseSlug slugifies display-style names", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(27),
        name: "Alpha Corp",
        slug: "alpha-corp",
      });
      const row = await entitiesRepo.getByCaseSlug(tx, cased.id, "Alpha Corp");
      expect(row?.id).toBe(entity.id);
    });
  });

  it("listSlugsInCase slugifies display-style names", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await seedEntity(tx, cased.id, {
        id: testId(28),
        name: "Beta LLC",
        slug: "beta-llc",
      });
      const rows = await entitiesRepo.listSlugsInCase(tx, cased.id, [
        "  Beta LLC  ",
      ]);
      expect(rows).toEqual([{ slug: "beta-llc" }]);
    });
  });
});
