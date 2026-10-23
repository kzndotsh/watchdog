import { beforeEach, describe, expect, it } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import {
  createTaskEffect,
  deleteTaskEffect,
  reorderTasksEffect,
  updateTaskEffect,
} from "@watchdog/core/tasks";
import { casesRepo, db, tasksRepo } from "@watchdog/db";
import type { TaskStatus } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  listAllActivity,
  resetTestDb,
  seedCase,
  twoWriters,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

async function seedTasks(count = 1) {
  const cased = await seedCase(db);
  const tasks = [];
  for (let n = 0; n < count; n += 1) {
    tasks.push(
      // oxlint-disable-next-line no-await-in-loop -- creation order is the column order
      await runDomain(
        createTaskEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          title: `Task ${n}`,
          actorId: TEST_ACTOR_ID,
        })
      )
    );
  }
  return { caseId: cased.id, tasks };
}

type Seeded = Awaited<ReturnType<typeof seedTasks>>;

function move(s: Seeded, taskId: string, status: TaskStatus) {
  return runDomain(
    updateTaskEffect({
      caseId: s.caseId,
      organizationId: TEST_ORGANIZATION_ID,
      taskId,
      status,
      actorId: TEST_ACTOR_ID,
    })
  );
}

async function transitions(taskId: string) {
  return (await listAllActivity())
    .filter((row) => row.subjectId === taskId && row.action !== "created")
    .map((row) => [row.action, row.fromValue, row.toValue]);
}

function failure(result: PromiseSettledResult<unknown>): unknown {
  if (result.status !== "rejected") throw new Error("expected a failure");
  return result.reason;
}

describe("Task moves", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("two writers", () => {
    it("two moves of one Task chain: the second entry starts where the first ended", async () => {
      const s = await seedTasks();
      const [task] = s.tasks;
      if (task === undefined) throw new Error("seed");
      const race = twoWriters({ pauseAt: "moved" });
      race.pauseAfter(tasksRepo, "updateInCase", "moved");

      const outcome = await race.run({
        a: () => move(s, task.id, "in_progress"),
        b: () => move(s, task.id, "done"),
      });

      expect(outcome.bBlocked).toBe(true);
      expect(outcome.a.status).toBe("fulfilled");
      expect(outcome.b.status).toBe("fulfilled");
      expect(await transitions(task.id)).toEqual([
        ["status_changed", "backlog", "in_progress"],
        ["status_changed", "in_progress", "done"],
      ]);
    });

    it("moves of two Tasks into one column take distinct positions", async () => {
      const s = await seedTasks(2);
      const [first, second] = s.tasks;
      if (first === undefined || second === undefined) throw new Error("seed");
      const race = twoWriters({ pauseAt: "positioned" });
      race.pauseAfter(tasksRepo, "nextPosition", "positioned");

      const outcome = await race.run({
        a: () => move(s, first.id, "done"),
        b: () => move(s, second.id, "done"),
      });

      expect(outcome.bBlocked).toBe(true);
      const positions = [outcome.a, outcome.b].map((r) =>
        r.status === "fulfilled" ? r.value.position : -1
      );
      expect(new Set(positions).size).toBe(2);
      expect([...positions].sort((x, y) => x - y)).toEqual([0, 1]);
    });

    it("a move of a Task that a delete is removing is NotFound and logs no move", async () => {
      const s = await seedTasks();
      const [task] = s.tasks;
      if (task === undefined) throw new Error("seed");
      const race = twoWriters({ pauseAt: "removed" });
      race.pauseAfter(tasksRepo, "removeInCase", "removed");

      const outcome = await race.run({
        a: () =>
          runDomain(
            deleteTaskEffect(
              s.caseId,
              TEST_ORGANIZATION_ID,
              task.id,
              TEST_ACTOR_ID
            )
          ),
        b: () => move(s, task.id, "done"),
      });

      expect(outcome.bBlocked).toBe(true);
      expect(outcome.a.status).toBe("fulfilled");
      expect(failure(outcome.b)).toMatchObject({ _tag: "NotFoundError" });
      expect(await transitions(task.id)).toEqual([
        ["deleted", "backlog", null],
      ]);
    });

    it("a reorder that waits on a move sees the column after the move", async () => {
      const s = await seedTasks(2);
      const [first, second] = s.tasks;
      if (first === undefined || second === undefined) throw new Error("seed");
      const race = twoWriters({ pauseAt: "case-locked" });
      race.pauseAfter(casesRepo, "lockById", "case-locked");

      const outcome = await race.run({
        a: () => move(s, first.id, "done"),
        b: () =>
          runDomain(
            reorderTasksEffect({
              caseId: s.caseId,
              organizationId: TEST_ORGANIZATION_ID,
              status: "backlog",
              // The column the writer saw before the move: now one Task short.
              orderedIds: [first.id, second.id],
              actorId: TEST_ACTOR_ID,
            })
          ),
      });

      expect(outcome.bBlocked).toBe(true);
      expect(outcome.a.status).toBe("fulfilled");
      expect(failure(outcome.b)).toMatchObject({ _tag: "InvalidError" });
    });
  });
});
