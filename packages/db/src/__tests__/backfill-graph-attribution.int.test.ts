import { readFileSync } from "node:fs";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { CaseId } from "@watchdog/schemas/shared";
import { seedCase, seedEntity, withSystemTestTx } from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import {
  activityLogRepo,
  claims,
  claimsRepo,
  entitiesRepo,
  setGraphHistoryContext,
  questionsRepo,
  tasksRepo,
  type DbTx,
} from "../index.ts";

/**
 * Migration `0030_backfill_graph_attribution` (issue #303): rows written before
 * attribution get created_by / updated_by from the activity log where an entry
 * names the author, and stay NULL (unknown) where none does. Runs the
 * migration's own statements against rows written without attribution.
 */
const MIGRATION_SQL = readFileSync(
  new URL("../../drizzle/0030_backfill_graph_attribution.sql", import.meta.url),
  "utf-8"
);

async function runMigration(tx: DbTx): Promise<void> {
  const statements = MIGRATION_SQL.split("--> statement-breakpoint")
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter((statement) => statement !== "");
  for (const statement of statements) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- statements run in file order
    await tx.execute(sql.raw(statement));
  }
}

const ALICE = testId(901);
const BOB = testId(902);

async function logEntry(
  tx: DbTx,
  caseId: CaseId,
  entry: {
    kind: "entity" | "claim" | "question" | "task";
    action: string;
    subjectId: string;
    actorId: string | null;
  }
) {
  const row = await activityLogRepo.append(tx, { caseId, ...entry });
  if (row === null) throw new Error("activity entry");
}

async function authorsOf(tx: DbTx, entityId: string) {
  const row = await entitiesRepo.getById(tx, entityId);
  return { createdBy: row?.createdBy, updatedBy: row?.updatedBy };
}

describe("migration backfill_graph_attribution", () => {
  it("takes the creator from the earliest `created` entry and the last editor from the newest entry", async () => {
    await withSystemTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id);
      const base = { caseId: cased.id, kind: "entity" as const };
      await logEntry(tx, cased.id, {
        ...base,
        action: "created",
        subjectId: entity.id,
        actorId: ALICE,
      });
      await logEntry(tx, cased.id, {
        ...base,
        action: "updated",
        subjectId: entity.id,
        actorId: BOB,
      });
      await logEntry(tx, cased.id, {
        ...base,
        action: "updated",
        subjectId: entity.id,
        actorId: ALICE,
      });
      expect(await authorsOf(tx, entity.id)).toEqual({
        createdBy: null,
        updatedBy: null,
      });

      await runMigration(tx);

      expect(await authorsOf(tx, entity.id)).toEqual({
        createdBy: ALICE,
        updatedBy: ALICE,
      });
    });
  });

  it("leaves a row NULL (unknown) when no entry names an author", async () => {
    await withSystemTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const noEntry = await seedEntity(tx, cased.id, {
        id: testId(11),
        slug: "no-entry",
      });
      const systemOnly = await seedEntity(tx, cased.id, {
        id: testId(12),
        slug: "system-only",
      });
      await logEntry(tx, cased.id, {
        kind: "entity",
        action: "created",
        subjectId: systemOnly.id,
        actorId: null,
      });

      await runMigration(tx);

      const unknown = { createdBy: null, updatedBy: null };
      expect(await authorsOf(tx, noEntry.id)).toEqual(unknown);
      expect(await authorsOf(tx, systemOnly.id)).toEqual(unknown);
    });
  });

  it("does not overwrite an author already recorded, and a second run changes nothing", async () => {
    await withSystemTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id);
      // BOB edits it under a context, so the row already names its last editor.
      await setGraphHistoryContext(tx, { actorId: BOB, channel: "dossier" });
      await entitiesRepo.update(tx, entity.id, { summary: "edited" });
      await logEntry(tx, cased.id, {
        kind: "entity",
        action: "created",
        subjectId: entity.id,
        actorId: ALICE,
      });
      await logEntry(tx, cased.id, {
        kind: "entity",
        action: "updated",
        subjectId: entity.id,
        actorId: ALICE,
      });

      await runMigration(tx);
      const first = await authorsOf(tx, entity.id);
      await runMigration(tx);

      expect(first).toEqual({ createdBy: ALICE, updatedBy: BOB });
      expect(await authorsOf(tx, entity.id)).toEqual(first);
    });
  });

  it("covers every Graph table: claims, questions and tasks too, and a retracted Claim falls back to retracted_by", async () => {
    await withSystemTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const entity = await seedEntity(tx, cased.id);
      const claim = await claimsRepo.create(tx, {
        caseId: cased.id,
        entityId: entity.id,
        text: "Lives in Oslo",
        confidence: "unverified",
        class: "observation",
      });
      const retracted = await claimsRepo.create(tx, {
        caseId: cased.id,
        entityId: entity.id,
        text: "Lives in Bergen",
        confidence: "unverified",
        class: "observation",
      });
      const question = await questionsRepo.create(tx, {
        caseId: cased.id,
        entityId: entity.id,
        text: "Who funds them?",
        status: "open",
      });
      const task = await tasksRepo.create(tx, {
        caseId: cased.id,
        title: "Call the clerk",
        status: "backlog",
      });
      if (!claim || !retracted || !question || !task) throw new Error("seed");
      await claimsRepo.retract(tx, retracted.id, {
        retractKind: "disproved",
        retractedReason: "Wrong person",
        retractedBy: BOB,
      });
      // A Claim retracted before attribution: only `retracted_by` knows who.
      await tx
        .update(claims)
        .set({ updatedBy: null })
        .where(eq(claims.id, retracted.id));
      await logEntry(tx, cased.id, {
        kind: "claim",
        action: "created",
        subjectId: claim.id,
        actorId: ALICE,
      });
      await logEntry(tx, cased.id, {
        kind: "question",
        action: "created",
        subjectId: question.id,
        actorId: BOB,
      });
      await logEntry(tx, cased.id, {
        kind: "task",
        action: "created",
        subjectId: task.id,
        actorId: ALICE,
      });
      await logEntry(tx, cased.id, {
        kind: "task",
        action: "status_changed",
        subjectId: task.id,
        actorId: BOB,
      });

      await runMigration(tx);

      const [claimAfter] = await claimsRepo.listForEntity(tx, entity.id, {
        includeRetracted: true,
      });
      expect(claimAfter).toMatchObject({
        id: claim.id,
        createdBy: ALICE,
        updatedBy: ALICE,
      });
      const retractedAfter = (
        await claimsRepo.listForEntity(tx, entity.id, {
          includeRetracted: true,
        })
      ).find((row) => row.id === retracted.id);
      // No entry names the retractor or a creator: `retracted_by` is the only author left.
      expect(retractedAfter).toMatchObject({
        createdBy: null,
        updatedBy: BOB,
      });
      const [questionAfter] = await questionsRepo.listForEntity(tx, entity.id);
      expect(questionAfter).toMatchObject({
        createdBy: BOB,
        updatedBy: BOB,
      });
      const taskAfter = await tasksRepo.getInCase(tx, cased.id, task.id);
      expect(taskAfter).toMatchObject({ createdBy: ALICE, updatedBy: BOB });
    });
  });
});
