import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";
import {
  seedCase,
  seedEntity,
  seedIdentifier,
  withTestTx,
} from "@watchdog/test-kit/db";

import { identifiersRepo } from "../identifiers.repo.ts";

describe("identifiersRepo", () => {
  it("includes entityName on listForCase and returns the row from listForEntity", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(21),
        name: "Ada Lovelace",
        slug: "ada-lovelace",
      });
      const created = await seedIdentifier(tx, entity.id, {
        type: "email",
        value: "ada@example.com",
        platform: "",
      });

      const forEntity = await identifiersRepo.listForEntity(tx, entity.id);
      expect(forEntity.some((row) => row.id === created.id)).toBe(true);

      const forCase = await identifiersRepo.listForCase(tx, cased.id);
      const listed = forCase.find((row) => row.id === created.id);
      expect(listed?.entityName).toBe("Ada Lovelace");
      expect(listed?.entitySummary).toBeNull();
      expect(listed?.entityNotes).toBeNull();
      expect(listed?.value).toBe("ada@example.com");
    });
  });

  it("searchForCase matches entity display name", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(23),
        name: "Alpha Corp",
        slug: "alpha-corp",
      });
      await seedIdentifier(tx, entity.id, {
        type: "domain",
        value: "alpha.example",
        platform: "",
      });

      const hits = await identifiersRepo.searchForCase(
        tx,
        cased.id,
        "alpha corp",
        10
      );
      expect(hits.some((row) => row.value === "alpha.example")).toBe(true);
    });
  });

  it("searchForCase matches entity slug via slugified query", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(25),
        name: "Quiet Subject",
        slug: "unnamed-host",
      });
      await seedIdentifier(tx, entity.id, {
        type: "domain",
        value: "quiet.example",
        platform: "",
      });

      const hits = await identifiersRepo.searchForCase(
        tx,
        cased.id,
        "Unnamed Host",
        10
      );
      expect(hits.some((row) => row.value === "quiet.example")).toBe(true);
    });
  });

  it("searchForCase matches identifier notes", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(24),
        name: "Beta Subject",
        slug: "beta-subject",
      });
      await seedIdentifier(tx, entity.id, {
        type: "handle",
        value: "betahandle",
        platform: "twitter",
        notes: "Archived burner account",
      });

      const hits = await identifiersRepo.searchForCase(
        tx,
        cased.id,
        "burner account",
        10
      );
      expect(hits.some((row) => row.value === "betahandle")).toBe(true);
    });
  });

  it("searchForCase matches attached entity notes", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(27),
        name: "Gamma Subject",
        slug: "gamma-subject",
        notes: "Mailbox tied to the fraud thread",
      });
      await seedIdentifier(tx, entity.id, {
        type: "email",
        value: "gamma@example.com",
        platform: "",
      });

      const hits = await identifiersRepo.searchForCase(
        tx,
        cased.id,
        "fraud thread",
        10
      );
      expect(hits.some((row) => row.value === "gamma@example.com")).toBe(true);
    });
  });

  it("searchForCase matches identifier status and confidence", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(28),
        name: "Status Subject",
        slug: "status-subject",
      });
      await seedIdentifier(tx, entity.id, {
        type: "email",
        value: "ops@acme.test",
        platform: "",
        status: "current",
        confidence: "confirmed",
      });

      const byStatus = await identifiersRepo.searchForCase(
        tx,
        cased.id,
        "current",
        10
      );
      expect(byStatus.some((row) => row.value === "ops@acme.test")).toBe(true);

      const byConfidence = await identifiersRepo.searchForCase(
        tx,
        cased.id,
        "confirmed",
        10
      );
      expect(byConfidence.some((row) => row.value === "ops@acme.test")).toBe(
        true
      );
    });
  });

  it("searchForCase matches platform display labels", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(29),
        name: "Platform Subject",
        slug: "platform-subject",
      });
      await seedIdentifier(tx, entity.id, {
        type: "handle",
        value: "@platform-user",
        platform: "twitter",
      });

      const hits = await identifiersRepo.searchForCase(
        tx,
        cased.id,
        "X / Twitter",
        10
      );
      expect(hits.some((row) => row.value === "@platform-user")).toBe(true);
    });
  });

  it("updateInCase rejects updates outside the case", async () => {
    await withTestTx(async (tx) => {
      const caseA = await seedCase(tx);
      const caseB = await seedCase(tx);
      const entityB = await seedEntity(tx, caseB.id, {
        id: testId(23),
        name: "Other",
        slug: "other-update",
      });
      const created = await seedIdentifier(tx, entityB.id, {
        type: "email",
        value: "other@example.com",
        platform: "",
      });
      const updated = await identifiersRepo.updateInCase(
        tx,
        caseA.id,
        created.id,
        { notes: "cross-case" }
      );
      expect(updated).toBeNull();
      const row = await identifiersRepo.getInCase(tx, caseB.id, created.id);
      expect(row?.notes).toBeNull();
    });
  });

  it("deleteInCase removes the identifier when owned by the case", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const other = await seedCase(tx, { slug: "other-case" });
      const entity = await seedEntity(tx, cased.id, {
        id: testId(22),
        name: "Subject",
        slug: "subject",
      });
      const created = await seedIdentifier(tx, entity.id, {
        type: "email",
        value: "delete-me@example.com",
        platform: "",
      });

      expect(await identifiersRepo.deleteInCase(tx, other.id, created.id)).toBe(
        false
      );
      expect(await identifiersRepo.deleteInCase(tx, cased.id, created.id)).toBe(
        true
      );
      expect(
        await identifiersRepo.getInCase(tx, cased.id, created.id)
      ).toBeNull();
    });
  });

  it("trims padded identifier value on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(30),
        name: "Subject",
        slug: "subject-trim",
      });
      const created = await identifiersRepo.create(tx, {
        entityId: entity.id,
        type: "email",
        platform: "  github  ",
        value: "  ada@example.com  ",
        confidence: "unverified",
        status: "active",
        notes: "  note  ",
      });
      expect(created?.value).toBe("ada@example.com");
      expect(created?.platform).toBe("github");
      expect(created?.notes).toBe("note");
    });
  });

  it("rejects blank identifier value on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(31),
        name: "Subject",
        slug: "subject-blank",
      });
      const created = await identifiersRepo.create(tx, {
        entityId: entity.id,
        type: "email",
        platform: "",
        value: "   ",
        confidence: "unverified",
        status: "active",
        notes: null,
      });
      expect(created).toBeNull();
    });
  });
});
