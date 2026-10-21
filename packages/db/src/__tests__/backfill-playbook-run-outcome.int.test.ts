import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { CaseId, JobStatus } from "@watchdog/schemas/shared";
import {
  seedCase,
  seedJob,
  seedPlaybookRun,
  withTestTx,
} from "@watchdog/test-db";

import { playbookRunsRepo, type DbTx } from "../index.ts";

/**
 * Migration `0042_playbook_run_outcome` (#354): a finished run's outcome from its Jobs, one
 * verdict per step that got a Job. Runs the migration's own UPDATE against runs written
 * without an outcome (the DDL needs table ownership, which the app role here lacks).
 */
const MIGRATION_SQL = readFileSync(
  new URL("../../drizzle/0042_playbook_run_outcome.sql", import.meta.url),
  "utf-8"
);

async function runBackfill(tx: DbTx): Promise<void> {
  const statements = MIGRATION_SQL.split("--> statement-breakpoint")
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter((statement) => statement.startsWith("UPDATE"));
  expect(statements).toHaveLength(1);
  for (const statement of statements) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one statement
    await tx.execute(sql.raw(statement));
  }
}

type Step = readonly JobStatus[];

async function finishedRun(
  tx: DbTx,
  caseId: CaseId,
  steps: readonly Step[],
  status: "finished" | "running" | "cancelled" = "finished"
) {
  const run = await seedPlaybookRun(tx, caseId, { status });
  for (const [step, statuses] of steps.entries()) {
    for (const [fanIndex, jobStatus] of statuses.entries()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Jobs go in step order
      await seedJob(tx, caseId, {
        status: jobStatus,
        playbookRunId: run.id,
        playbookStep: step,
        playbookFanIndex: fanIndex,
      });
    }
  }
  return run.id;
}

async function outcomeOf(tx: DbTx, runId: string) {
  return (await playbookRunsRepo.get(tx, runId))?.outcome;
}

describe("backfill playbook_runs.outcome", () => {
  it("is succeeded when every step with a Job succeeded", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await finishedRun(tx, cased.id, [
        ["succeeded"],
        ["succeeded"],
      ]);
      await runBackfill(tx);
      expect(await outcomeOf(tx, run)).toBe("succeeded");
    });
  });

  it("is failed when no step succeeded", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await finishedRun(tx, cased.id, [["failed"], ["cancelled"]]);
      await runBackfill(tx);
      expect(await outcomeOf(tx, run)).toBe("failed");
    });
  });

  it("is partial when some steps succeeded and some did not", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await finishedRun(tx, cased.id, [["succeeded"], ["failed"]]);
      await runBackfill(tx);
      expect(await outcomeOf(tx, run)).toBe("partial");
    });
  });

  it("counts a fan-out step as succeeded when any sibling succeeded", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await finishedRun(tx, cased.id, [
        ["succeeded"],
        ["failed", "succeeded", "failed"],
      ]);
      await runBackfill(tx);
      expect(await outcomeOf(tx, run)).toBe("succeeded");
    });
  });

  it("is failed for a finished run with no Jobs", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await finishedRun(tx, cased.id, []);
      await runBackfill(tx);
      expect(await outcomeOf(tx, run)).toBe("failed");
    });
  });

  it("leaves running and cancelled runs without an outcome", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const running = await finishedRun(tx, cased.id, [["running"]], "running");
      const cancelled = await finishedRun(
        tx,
        cased.id,
        [["cancelled"]],
        "cancelled"
      );
      await runBackfill(tx);
      expect(await outcomeOf(tx, running)).toBeNull();
      expect(await outcomeOf(tx, cancelled)).toBeNull();
    });
  });
});
