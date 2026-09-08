import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";
import {
  seedCase,
  seedEntity,
  seedEvidence,
  withTestTx,
} from "@watchdog/test-kit/db";

import { evidenceRepo } from "../evidence.repo.ts";

describe("evidenceRepo", () => {
  it("hides soft-deleted rows from the default list and shows them via deletedOnly", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await seedEvidence(tx, cased.id);

      const before = await evidenceRepo.listForCase(tx, cased.id);
      expect(before.some((row) => row.id === created.id)).toBe(true);

      const deleted = await evidenceRepo.softDelete(tx, cased.id, created.id);
      expect(deleted?.id).toBe(created.id);

      const after = await evidenceRepo.listForCase(tx, cased.id);
      expect(after.some((row) => row.id === created.id)).toBe(false);

      const hidden = await evidenceRepo.listForCase(tx, cased.id, {
        deletedOnly: true,
      });
      expect(hidden.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("searchForCase matches attached entity display name", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(24),
        name: "Beta Holdings",
        slug: "beta-holdings",
      });
      const created = await seedEvidence(tx, cased.id, {
        entityId: entity.id,
        label: "screenshot",
      });

      const hits = await evidenceRepo.searchForCase(
        tx,
        cased.id,
        "beta holdings",
        10
      );
      expect(hits.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("searchForCase matches attached entity notes", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(25),
        name: "Gamma Subject",
        slug: "gamma-subject",
        notes: "Primary mailbox for the fraud thread",
      });
      const created = await seedEvidence(tx, cased.id, {
        entityId: entity.id,
        label: "inbox-export",
      });

      const hits = await evidenceRepo.searchForCase(
        tx,
        cased.id,
        "fraud thread",
        10
      );
      expect(hits.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("searchForCase matches sha256, mime, and kind", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await seedEvidence(tx, cased.id, {
        label: null,
        kind: "file",
        mime: "application/pdf",
        sha256:
          "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
        text: null,
      });

      const bySha = await evidenceRepo.searchForCase(
        tx,
        cased.id,
        "aabbccdd",
        10
      );
      expect(bySha.some((row) => row.id === created.id)).toBe(true);

      const byMime = await evidenceRepo.searchForCase(
        tx,
        cased.id,
        "application/pdf",
        10
      );
      expect(byMime.some((row) => row.id === created.id)).toBe(true);

      const byKind = await evidenceRepo.searchForCase(tx, cased.id, "file", 10);
      expect(byKind.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("searchForCase matches evidence kind display label", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await seedEvidence(tx, cased.id, {
        label: null,
        kind: "url_archive",
        sourceUrl: "https://example.com/page",
        text: null,
      });

      const hits = await evidenceRepo.searchForCase(
        tx,
        cased.id,
        "URL Archive",
        10
      );
      expect(hits.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("searchForCase matches attached entity kind display label", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(27),
        name: "Subject",
        slug: "subject",
        kind: "org",
      });
      const created = await seedEvidence(tx, cased.id, {
        entityId: entity.id,
        label: "registry-export",
      });

      const hits = await evidenceRepo.searchForCase(tx, cased.id, "Org", 10);
      expect(hits.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("listActivityLabelsInCase resolves labels for hidden evidence ids", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await seedEvidence(tx, cased.id, {
        label: "Hidden dump",
      });
      await evidenceRepo.softDelete(tx, cased.id, created.id);

      const labels = await evidenceRepo.listActivityLabelsInCase(tx, cased.id, [
        created.id,
      ]);
      expect(labels).toEqual([
        {
          id: created.id,
          label: "Hidden dump",
          kind: created.kind,
          sourceUrl: created.sourceUrl,
        },
      ]);
    });
  });

  it("listIdsInCase includes hidden evidence ids", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await seedEvidence(tx, cased.id, { label: "Hidden" });
      await evidenceRepo.softDelete(tx, cased.id, created.id);

      const ids = await evidenceRepo.listIdsInCase(tx, cased.id, [created.id]);
      expect(ids.map((row) => row.id)).toEqual([created.id]);
    });
  });

  it("markProcessed is idempotent when evidence is already processed", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await seedEvidence(tx, cased.id);

      expect(await evidenceRepo.markProcessed(tx, cased.id, created.id)).toBe(
        true
      );
      const afterFirst = await evidenceRepo.getActiveInCase(
        tx,
        cased.id,
        created.id
      );
      expect(afterFirst?.processedAt).not.toBeNull();

      expect(await evidenceRepo.markProcessed(tx, cased.id, created.id)).toBe(
        false
      );
      const afterSecond = await evidenceRepo.getActiveInCase(
        tx,
        cased.id,
        created.id
      );
      expect(afterSecond?.processedAt).toEqual(afterFirst?.processedAt);
    });
  });

  it("trims padded case and evidence ids on scoped lookups", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await seedEvidence(tx, cased.id);

      const row = await evidenceRepo.getActiveInCase(
        tx,
        `  ${cased.id}  `,
        `  ${created.id}  `
      );
      expect(row?.id).toBe(created.id);

      expect(
        await evidenceRepo.markProcessed(
          tx,
          `  ${cased.id}  `,
          `  ${created.id}  `
        )
      ).toBe(true);
    });
  });

  it("trims padded case id on listForCase", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await seedEvidence(tx, cased.id);

      const rows = await evidenceRepo.listForCase(tx, `  ${cased.id}  `);
      expect(rows.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("trims padded evidence metadata on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await evidenceRepo.create(tx, {
        caseId: cased.id,
        entityId: null,
        kind: "other",
        label: "  Registry export  ",
        notes: "  from vendor  ",
        mime: null,
        uri: "  s3://bucket/key  ",
        sha256: null,
        text: null,
        sourceUrl: "  https://example.com/doc  ",
        actorId: "  actor-1  ",
        actorLabel: "  Ada  ",
      });
      expect(created?.actorId).toBe("actor-1");
      expect(created?.label).toBe("Registry export");
      expect(created?.notes).toBe("from vendor");
      expect(created?.uri).toBe("s3://bucket/key");
      expect(created?.sourceUrl).toBe("https://example.com/doc");
      expect(created?.actorLabel).toBe("Ada");
    });
  });

  it("rejects blank actorId on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await evidenceRepo.create(tx, {
        caseId: cased.id,
        entityId: null,
        kind: "other",
        label: null,
        notes: null,
        mime: null,
        uri: null,
        sha256: null,
        text: null,
        sourceUrl: null,
        actorId: "   ",
        actorLabel: null,
      });
      expect(created).toBeNull();
    });
  });

  it("rejects invalid entityId on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await evidenceRepo.create(tx, {
        caseId: cased.id,
        entityId: "ent-1",
        kind: "other",
        label: null,
        notes: null,
        mime: null,
        uri: null,
        sha256: null,
        text: null,
        sourceUrl: null,
        actorId: "actor-1",
        actorLabel: null,
      });
      expect(created).toBeNull();
    });
  });

  it("rejects invalid entityId on setEntityInCase", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await seedEvidence(tx, cased.id);
      const updated = await evidenceRepo.setEntityInCase(
        tx,
        cased.id,
        created.id,
        "ent-1"
      );
      expect(updated).toBeNull();
    });
  });
});
