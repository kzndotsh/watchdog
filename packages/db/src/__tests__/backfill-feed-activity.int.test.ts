import { readFileSync } from "node:fs";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { CaseId } from "@watchdog/schemas/shared";
import { seedCase, withTestTx } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import {
  activity,
  activityLogRepo,
  evidence,
  evidenceRepo,
  jobs,
  jobsRepo,
  proposals,
  proposalsRepo,
  type DbTx,
} from "../index.ts";

/**
 * Migration `0017_backfill_feed_activity` (ADR-0005 S6): the pre-log Evidence,
 * Proposals and Jobs of the last 90 days get the entries their write paths
 * append today, once. Runs the migration's own statements against rows that
 * were written without log entries.
 */
const MIGRATION = new URL(
  "../../drizzle/0017_backfill_feed_activity.sql",
  import.meta.url
);

const MIGRATION_SQL = readFileSync(MIGRATION, "utf-8");

/**
 * The copy statements. The trigger toggles (`ALTER TABLE`) need table ownership,
 * which the app role of the test database does not have; they only silence the
 * per-row NOTIFY and are asserted separately below.
 */
async function runMigration(tx: DbTx): Promise<void> {
  const statements = MIGRATION_SQL.split("--> statement-breakpoint")
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter(
      (statement) => statement !== "" && !statement.startsWith("ALTER TABLE")
    );
  for (const statement of statements) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- statements run in file order
    await tx.execute(sql.raw(statement));
  }
}

const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

async function seedLegacyEvidence(
  tx: DbTx,
  caseId: CaseId,
  values: {
    label: string | null;
    sourceUrl?: string | null;
    kind?: "file" | "url_archive" | "attestation" | "other";
    at: Date;
  }
) {
  const created = await evidenceRepo.create(tx, {
    caseId,
    entityId: null,
    kind: values.kind ?? "attestation",
    label: values.label,
    notes: null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: "body",
    sourceUrl: values.sourceUrl ?? null,
    actorId: TEST_ACTOR_ID,
  });
  if (created === null) throw new Error("evidence");
  await tx
    .update(evidence)
    .set({ capturedAt: values.at })
    .where(eq(evidence.id, created.id));
  return created;
}

async function entries(tx: DbTx, kind: string) {
  return tx
    .select()
    .from(activity)
    .where(eq(activity.kind, kind as "evidence"))
    .orderBy(activity.id);
}

describe("migration backfill_feed_activity", () => {
  it("backfills Evidence captured within the window with its display label, once", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const labelled = await seedLegacyEvidence(tx, cased.id, {
        label: "  note  ",
        at: daysAgo(2),
      });
      const byHost = await seedLegacyEvidence(tx, cased.id, {
        label: null,
        kind: "url_archive",
        sourceUrl: "https://Example.com:8443/page?q=1",
        at: daysAgo(3),
      });
      const byKind = await seedLegacyEvidence(tx, cased.id, {
        label: " ",
        kind: "file",
        at: daysAgo(4),
      });
      const old = await seedLegacyEvidence(tx, cased.id, {
        label: "old",
        at: daysAgo(120),
      });
      const hidden = await seedLegacyEvidence(tx, cased.id, {
        label: "hidden",
        at: daysAgo(1),
      });
      await evidenceRepo.softDelete(tx, cased.id, hidden.id);

      await runMigration(tx);
      await runMigration(tx);

      const rows = await entries(tx, "evidence");
      const bySubject = new Map(rows.map((row) => [row.subjectId, row]));
      expect(rows).toHaveLength(3);
      expect(bySubject.get(labelled.id)).toMatchObject({
        action: "captured",
        label: "note",
        actorId: TEST_ACTOR_ID,
        xid: "0",
        caseId: cased.id,
      });
      const at = bySubject.get(labelled.id)?.createdAt.getTime() ?? 0;
      expect(Math.abs(at - daysAgo(2).getTime())).toBeLessThan(60_000);
      expect(bySubject.get(byHost.id)?.label).toBe("example.com");
      expect(bySubject.get(byKind.id)?.label).toBe("File");
      expect(bySubject.has(old.id)).toBe(false);
      expect(bySubject.has(hidden.id)).toBe(false);
    });
  });

  it("does not duplicate an entry the write path already appended", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const row = await seedLegacyEvidence(tx, cased.id, {
        label: "live",
        at: daysAgo(1),
      });
      await activityLogRepo.append(tx, {
        caseId: cased.id,
        kind: "evidence",
        action: "captured",
        subjectId: row.id,
        label: "live",
      });
      await runMigration(tx);
      expect(await entries(tx, "evidence")).toHaveLength(1);
    });
  });

  it("backfills Proposals as created and decided, with no label", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const base = { caseId: cased.id, patch: [], evidenceIds: [] };
      const pending = await proposalsRepo.create(tx, {
        ...base,
        status: "pending",
        summary: "pending one",
      });
      const accepted = await proposalsRepo.create(tx, {
        ...base,
        status: "pending",
        agentSourced: true,
        createdBy: TEST_ACTOR_ID,
      });
      if (pending === null || accepted === null) throw new Error("proposal");
      await tx
        .update(proposals)
        .set({
          status: "accepted",
          decidedBy: "reviewer-1",
          decidedAt: daysAgo(1),
        })
        .where(eq(proposals.id, accepted.id));

      await runMigration(tx);
      await runMigration(tx);

      const rows = await entries(tx, "proposal");
      expect(rows.map((row) => [row.subjectId, row.action])).toEqual(
        expect.arrayContaining([
          [pending.id, "created"],
          [accepted.id, "created"],
          [accepted.id, "accepted"],
        ])
      );
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.label === null && row.xid === "0")).toBe(
        true
      );
      const created = rows.find(
        (row) => row.subjectId === accepted.id && row.action === "created"
      );
      expect(created?.actorId).toBe(TEST_ACTOR_ID);
      const decision = rows.find((row) => row.action === "accepted");
      expect(decision).toMatchObject({
        actorId: "reviewer-1",
        fromValue: "pending",
        toValue: "accepted",
      });
      const cap = rows.find(
        (row) => row.subjectId === pending.id && row.action === "created"
      );
      expect(cap?.actorId).toBeNull();
    });
  });

  it("backfills Jobs as queued, running and their terminal status, grouped by run", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const job = await jobsRepo.create(tx, {
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        input: { host: "example.com" },
        status: "succeeded",
        actorId: TEST_ACTOR_ID,
      });
      if (job === null) throw new Error("job");
      await tx
        .update(jobs)
        .set({
          createdAt: daysAgo(3),
          startedAt: daysAgo(2),
          finishedAt: daysAgo(1),
        })
        .where(eq(jobs.id, job.id));

      await runMigration(tx);
      await runMigration(tx);

      const rows = await entries(tx, "job");
      expect(rows.map((row) => row.action)).toEqual([
        "queued",
        "running",
        "succeeded",
      ]);
      expect(rows.every((row) => row.subjectId === job.id)).toBe(true);
      expect(rows.every((row) => row.label === null)).toBe(true);
    });
  });

  it("switches the notify trigger off for the copy and back on after it", () => {
    const off = MIGRATION_SQL.indexOf(
      'ALTER TABLE "activity" DISABLE TRIGGER "activity_notify_trg"'
    );
    const firstInsert = MIGRATION_SQL.indexOf('INSERT INTO "activity"');
    const on = MIGRATION_SQL.lastIndexOf(
      'ALTER TABLE "activity" ENABLE TRIGGER "activity_notify_trg"'
    );
    const lastInsert = MIGRATION_SQL.lastIndexOf('INSERT INTO "activity"');
    expect(off).toBeGreaterThanOrEqual(0);
    expect(off).toBeLessThan(firstInsert);
    expect(on).toBeGreaterThan(lastInsert);
  });
});
