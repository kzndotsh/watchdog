import { beforeEach, describe, expect, it } from "vitest";

import { getCaseCountsEffect } from "@watchdog/core/cases";
import { isDomainTag } from "@watchdog/core/errors";
import { runDomain } from "@watchdog/core/infra";
import {
  caseCountsRepo,
  edgesRepo,
  evidenceRepo,
  tasksRepo,
} from "@watchdog/db";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedIdentifier,
  seedJob,
  seedPlaybookRun,
  testDb,
  withSystemHistoryContext,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

const DAY_START = new Date("2026-03-10T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromStart(days: number): Date {
  return new Date(DAY_START.getTime() + days * DAY_MS + 12 * 60 * 60 * 1000);
}

async function seedTask(
  caseId: Awaited<ReturnType<typeof seedCase>>["id"],
  status: "backlog" | "done" | "dropped",
  dueDate: Date | null
) {
  const row = await withSystemHistoryContext(testDb, async (tx) =>
    tasksRepo.create(tx, { caseId, title: "Follow up", status, dueDate })
  );
  if (!row) throw new Error("task");
}

describe("case counts", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("counts a Case's tiles, hidden Evidence and finished work excluded", async () => {
    const cased = await seedCase(testDb, {
      name: "Counted",
      slug: "counted",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const alice = await seedEntity(testDb, cased.id, {
      id: testId(11),
      name: "Alice",
      slug: "alice",
    });
    const bob = await seedEntity(testDb, cased.id, {
      id: testId(12),
      name: "Bob",
      slug: "bob",
    });
    await seedIdentifier(testDb, alice.id, {
      type: "email",
      value: "a@x.test",
    });
    await seedIdentifier(testDb, alice.id, {
      type: "email",
      value: "b@x.test",
    });
    await seedIdentifier(testDb, bob.id, { type: "email", value: "c@x.test" });
    await withSystemHistoryContext(testDb, async (tx) =>
      edgesRepo.create(tx, {
        fromId: alice.id,
        toId: bob.id,
        caseId: cased.id,
        predicate: "associate_of",
        confidence: "unverified",
        notes: null,
      })
    );
    await seedEvidence(testDb, cased.id);
    const hidden = await seedEvidence(testDb, cased.id);
    await evidenceRepo.softDelete(testDb, cased.id, hidden.id);
    await seedJob(testDb, cased.id, { status: "queued" });
    await seedJob(testDb, cased.id, { status: "running" });
    await seedJob(testDb, cased.id, { status: "succeeded" });
    // A playbook run with three live steps is one live unit, like the Jobs queue shows it.
    const run = await seedPlaybookRun(testDb, cased.id);
    await Promise.all(
      [0, 1, 2].map(async (step) =>
        seedJob(testDb, cased.id, {
          status: "running",
          playbookRunId: run.id,
          playbookStep: step,
        })
      )
    );
    // Overdue: before the day start. Soon: from the day start through the next 7 days.
    await seedTask(cased.id, "backlog", daysFromStart(-3));
    await seedTask(cased.id, "done", daysFromStart(-3));
    await seedTask(cased.id, "backlog", daysFromStart(0));
    await seedTask(cased.id, "backlog", daysFromStart(7));
    await seedTask(cased.id, "dropped", daysFromStart(2));
    await seedTask(cased.id, "backlog", daysFromStart(8));
    await seedTask(cased.id, "backlog", null);

    const counts = await runDomain(
      getCaseCountsEffect(cased.id, TEST_ORGANIZATION_ID, {
        dayStart: DAY_START,
      })
    );

    const exact = (count: number) => ({ count, isCapped: false });
    expect(counts).toEqual({
      entities: exact(2),
      identifiers: exact(3),
      connections: exact(1),
      evidence: exact(1),
      liveJobs: exact(3),
      tasksOverdue: exact(1),
      tasksDueSoon: exact(2),
    });
  });

  it("stops scanning at the cap and says so", async () => {
    const cased = await seedCase(testDb, {
      name: "Capped",
      slug: "capped",
      organizationId: TEST_ORGANIZATION_ID,
    });
    await seedEntity(testDb, cased.id, { id: testId(21), slug: "one" });
    await seedEntity(testDb, cased.id, { id: testId(22), slug: "two" });
    await seedEntity(testDb, cased.id, { id: testId(23), slug: "three" });
    const window = { dayStart: DAY_START, soonEnd: daysFromStart(8) };

    const atCap = await caseCountsRepo.countCapped(testDb, cased.id, 3, window);
    const overCap = await caseCountsRepo.countCapped(
      testDb,
      cased.id,
      2,
      window
    );

    // min(rows, cap + 1): exactly the cap is not "more", one over is.
    expect(atCap.entities).toBe(3);
    expect(overCap.entities).toBe(3);
  });

  it("does not count, or reveal, another organization's Case", async () => {
    const ours = await seedCase(testDb, {
      name: "Ours",
      slug: "ours-counts",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const theirs = await seedCase(testDb, {
      name: "Theirs",
      slug: "theirs-counts",
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });
    await seedEntity(testDb, theirs.id, { id: testId(31), slug: "theirs" });
    await seedJob(testDb, theirs.id, { status: "running" });

    const mine = await runDomain(
      getCaseCountsEffect(ours.id, TEST_ORGANIZATION_ID)
    );
    expect(mine.entities.count).toBe(0);
    expect(mine.liveJobs.count).toBe(0);

    await expect(
      runDomain(getCaseCountsEffect(theirs.id, TEST_ORGANIZATION_ID))
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
  });
});
