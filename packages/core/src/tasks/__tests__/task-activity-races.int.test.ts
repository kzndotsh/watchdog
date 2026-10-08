import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import {
  createTaskEffect,
  deleteTaskEffect,
  updateTaskEffect,
} from "@watchdog/core/tasks";
import { activityLogRepo, casesRepo, db, tasksRepo } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase } from "@watchdog/test-db";
import { rendezvous, TEST_ACTOR_ID } from "@watchdog/test-kit";

const START = { xid: "0", id: 0 } as const;

async function entriesFor(subjectId: string) {
  const rows = await activityLogRepo.drain(db, { after: START, limit: 1000 });
  return rows.filter((row) => row.subjectId === subjectId);
}

async function seedTask() {
  const cased = await seedCase(db);
  const task = await runDomain(
    createTaskEffect({
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      title: "Follow up WHOIS",
      actorId: TEST_ACTOR_ID,
    })
  );
  return { caseId: cased.id, task };
}

describe("Task activity races", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a delete entry takes its label and status from the deleted row", async () => {
    const { caseId, task } = await seedTask();
    const real = tasksRepo.removeInCase.bind(tasksRepo);
    // The Task is renamed and moved between the existence read and the delete.
    vi.spyOn(tasksRepo, "removeInCase").mockImplementationOnce(
      async (...args) => {
        await tasksRepo.updateInCase(db, caseId, task.id, {
          title: "Renamed",
          status: "in_progress",
        });
        return real(...args);
      }
    );
    await runDomain(
      deleteTaskEffect(caseId, TEST_ORGANIZATION_ID, task.id, TEST_ACTOR_ID)
    );
    expect((await entriesFor(task.id)).at(-1)).toMatchObject({
      action: "deleted",
      label: "Renamed",
      fromValue: "in_progress",
    });
  });

  it("two concurrent moves to the same status append one status_changed", async () => {
    const { caseId, task } = await seedTask();
    // Both transactions are open before either takes the Case lock.
    const arrive = rendezvous(2);
    const real = casesRepo.lockById.bind(casesRepo);
    vi.spyOn(casesRepo, "lockById").mockImplementation(async (...args) => {
      await arrive();
      return real(...args);
    });
    const move = () =>
      runDomain(
        updateTaskEffect({
          caseId,
          organizationId: TEST_ORGANIZATION_ID,
          taskId: task.id,
          status: "in_progress",
          actorId: TEST_ACTOR_ID,
        })
      );
    await Promise.all([move(), move()]);
    const changed = (await entriesFor(task.id)).filter(
      (row) => row.action === "status_changed"
    );
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({
      fromValue: "backlog",
      toValue: "in_progress",
    });
  });
});
