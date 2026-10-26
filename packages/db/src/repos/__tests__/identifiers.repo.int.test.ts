import { describe, it, expect } from "vitest";

import {
  captureStatements,
  seedCase,
  seedEntity,
  seedIdentifier,
  withSystemTestTx,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import { identifiersRepo } from "../identifiers.repo.ts";

describe("identifiersRepo", () => {
  it("returns the row from listForEntity and finds it by value with its Entity's labels", async () => {
    await withSystemTestTx(async (tx) => {
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
      await seedIdentifier(tx, entity.id, {
        type: "email",
        value: "other@example.com",
        platform: "",
      });

      const forEntity = await identifiersRepo.listForEntity(tx, entity.id);
      expect(forEntity.some((row) => row.id === created.id)).toBe(true);

      const matching = await identifiersRepo.listWithValues(tx, cased.id, [
        "ada@example.com",
        "missing@example.com",
      ]);
      expect(matching.map((row) => row.id)).toEqual([created.id]);
      const [listed] = matching;
      expect(listed?.entityName).toBe("Ada Lovelace");
      expect(listed?.entitySlug).toBe("ada-lovelace");
      expect(listed?.entitySummary).toBeNull();
      expect(listed?.entityNotes).toBeNull();
      expect(await identifiersRepo.listWithValues(tx, cased.id, [])).toEqual(
        []
      );
    });
  });

  it("listWithValues binds any number of values as one array parameter", async () => {
    await withSystemTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id, {
        id: testId(22),
        name: "Grace Hopper",
        slug: "grace-hopper",
      });
      const created = await seedIdentifier(tx, entity.id, {
        type: "email",
        value: "grace@example.com",
        platform: "",
      });
      // More values than one statement could bind one parameter each (65,535).
      const values = Array.from(
        { length: 70_000 },
        (_, index) => `missing-${index}@example.com`
      );
      values.push("grace@example.com");
      const { statements, result } = await captureStatements(async () =>
        identifiersRepo.listWithValues(tx, cased.id, values)
      );
      expect(result.map((row) => row.id)).toEqual([created.id]);
      expect(statements).toHaveLength(1);
      expect(statements[0]?.params).toHaveLength(2);
    });
  });

  it("searchForCase matches entity display name", async () => {
    await withSystemTestTx(async (tx) => {
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
    await withSystemTestTx(async (tx) => {
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
    await withSystemTestTx(async (tx) => {
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
    await withSystemTestTx(async (tx) => {
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
    await withSystemTestTx(async (tx) => {
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
    await withSystemTestTx(async (tx) => {
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
    await withSystemTestTx(async (tx) => {
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
    await withSystemTestTx(async (tx) => {
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

      expect(
        await identifiersRepo.deleteInCase(tx, other.id, created.id)
      ).toBeNull();
      expect(
        await identifiersRepo.deleteInCase(tx, cased.id, created.id)
      ).toMatchObject({ id: created.id, value: "delete-me@example.com" });
      expect(
        await identifiersRepo.getInCase(tx, cased.id, created.id)
      ).toBeNull();
    });
  });
});
