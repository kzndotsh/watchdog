import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { FEED_ACTIONS } from "@watchdog/core/activity";
import { isDomainTag } from "@watchdog/core/errors";
import { listCappedEffect, runDomain } from "@watchdog/core/infra";
import {
  createTaskEffect,
  deleteTaskEffect,
  getTaskBoardEffect,
  listTasksForCaseEffect,
  reorderTasksEffect,
  updateTaskEffect,
} from "@watchdog/core/tasks";
import { activityLogRepo, db, taskListRepo } from "@watchdog/db";
import { taskList } from "@watchdog/schemas/feed";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, seedEntity } from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

describe("createTask", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("commits a case-scoped task in one transaction", async () => {
    const cased = await seedCase(db);
    const created = await runDomain(
      createTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        title: "Follow up WHOIS",
        actorId: TEST_ACTOR_ID,
      })
    );
    expect(created.title).toBe("Follow up WHOIS");
    expect(created.status).toBe("backlog");

    const listed = await runDomain(
      listTasksForCaseEffect(cased.id, TEST_ORGANIZATION_ID).pipe(
        Effect.map((page) => page.items)
      )
    );
    expect(listed.some((row) => row.id === created.id)).toBe(true);
  });

  it("rejects whitespace-only task title", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        createTaskEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          title: "   ",
          actorId: TEST_ACTOR_ID,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "invalid"
    );
  });

  it("omits blank actorId from activity events", async () => {
    const cased = await seedCase(db);
    const created = await runDomain(
      createTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        title: "No actor",
        actorId: "   ",
      })
    );
    const events = await activityLogRepo.recentFeed(db, {
      organizationId: TEST_ORGANIZATION_ID,
      caseId: cased.id,
      filters: [{ kind: "task", actions: FEED_ACTIONS.task }],
      limit: 10,
    });
    const createdEvent = events.find(
      (row) => row.action === "created" && row.subjectId === created.id
    );
    expect(createdEvent?.actorId).toBeNull();
  });

  it("writes an activity event when status changes", async () => {
    const cased = await seedCase(db);
    const created = await runDomain(
      createTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        title: "Move me",
        actorId: TEST_ACTOR_ID,
      })
    );
    await runDomain(
      updateTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        taskId: created.id,
        status: "in_progress",
        actorId: TEST_ACTOR_ID,
      })
    );
    const events = await activityLogRepo.recentFeed(db, {
      organizationId: TEST_ORGANIZATION_ID,
      caseId: cased.id,
      filters: [{ kind: "task", actions: FEED_ACTIONS.task }],
      limit: 10,
    });
    expect(events.some((row) => row.action === "status_changed")).toBe(true);
    expect(events.every((row) => row.actorId === TEST_ACTOR_ID)).toBe(true);
  });

  it("trims padded dueDate on create and treats whitespace-only as null", async () => {
    const cased = await seedCase(db);
    const created = await runDomain(
      createTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        title: "Due soon",
        dueDate: "  2026-06-15T12:00:00.000Z  ",
        actorId: TEST_ACTOR_ID,
      })
    );
    expect(created.dueDate).toBe("2026-06-15T12:00:00.000Z");

    const cleared = await runDomain(
      updateTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        taskId: created.id,
        dueDate: "   ",
        actorId: TEST_ACTOR_ID,
      })
    );
    expect(cleared.dueDate).toBe(null);
  });

  it("rejects an entity from another case", async () => {
    const cased = await seedCase(db);
    const other = await seedCase(db);
    const foreign = await seedEntity(db, other.id, {
      id: testId(20),
      slug: "foreign",
    });
    await expect(
      runDomain(
        createTaskEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          title: "Bad entity",
          entityId: foreign.id,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
  });

  it("deletes a task", async () => {
    const cased = await seedCase(db);
    const created = await runDomain(
      createTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        title: "Drop me",
      })
    );
    await runDomain(
      deleteTaskEffect(cased.id, TEST_ORGANIZATION_ID, created.id)
    );
    const listed = await runDomain(
      listTasksForCaseEffect(cased.id, TEST_ORGANIZATION_ID).pipe(
        Effect.map((page) => page.items)
      )
    );
    expect(listed.some((row) => row.id === created.id)).toBe(false);
  });

  it("reorders tasks within a status column", async () => {
    const cased = await seedCase(db);
    const first = await runDomain(
      createTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        title: "First",
      })
    );
    const second = await runDomain(
      createTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        title: "Second",
      })
    );
    const reordered = await runDomain(
      reorderTasksEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        status: "backlog",
        orderedIds: [second.id, first.id],
      })
    );
    expect(reordered.map((row) => row.id)).toEqual([second.id, first.id]);
    const board = await runDomain(
      getTaskBoardEffect(cased.id, TEST_ORGANIZATION_ID, {})
    );
    expect(board.items.map((row) => row.id)).toEqual([second.id, first.id]);
  });

  it("assigns distinct positions for concurrent creates", async () => {
    const cased = await seedCase(db);
    const [first, second] = await Promise.all([
      runDomain(
        createTaskEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          title: "Concurrent A",
          actorId: TEST_ACTOR_ID,
        })
      ),
      runDomain(
        createTaskEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          title: "Concurrent B",
          actorId: TEST_ACTOR_ID,
        })
      ),
    ]);
    expect(first.position).not.toBe(second.position);
  });

  it("reorders the shown part of a column: the rest keep their slots", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id);
    const create = async (title: string, entityId?: string) =>
      runDomain(
        createTaskEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          title,
          ...(entityId === undefined ? {} : { entityId }),
        })
      );
    const a = await create("A", entity.id);
    const b = await create("B");
    const c = await create("C", entity.id);
    // The board filtered to the Entity shows A and C, and the drag puts C first.
    await runDomain(
      reorderTasksEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        status: "backlog",
        orderedIds: [c.id, a.id],
      })
    );
    const board = await runDomain(
      getTaskBoardEffect(cased.id, TEST_ORGANIZATION_ID, {})
    );
    expect(board.items.map((row) => row.id)).toEqual([c.id, b.id, a.id]);
  });

  it("boards the open Tasks with their Entity's label, never a finished one", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { name: "Acme Ltd" });
    const open = await runDomain(
      createTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        title: "Open",
        status: "blocked",
        entityId: entity.id,
      })
    );
    for (const status of ["done", "dropped"] as const) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- seeds in order
      await runDomain(
        createTaskEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          title: status,
          status,
        })
      );
    }
    const board = await runDomain(
      getTaskBoardEffect(cased.id, TEST_ORGANIZATION_ID, {
        entityId: entity.id,
      })
    );
    expect(board).toEqual({
      items: [
        expect.objectContaining({
          id: open.id,
          entity: {
            id: entity.id,
            name: "Acme Ltd",
            slug: entity.slug,
            kind: entity.kind,
          },
        }),
      ],
      isTruncated: false,
    });
    const done = await runDomain(
      listTasksForCaseEffect(
        cased.id,
        TEST_ORGANIZATION_ID,
        taskList.input.parse({ caseId: cased.id, status: ["done"] })
      )
    );
    expect(done.items.map((row) => row.title)).toEqual(["done"]);
    expect(done.total).toEqual({ count: 1, isCapped: false });
  });

  it("cuts a capped read at the cap and says so", async () => {
    const cased = await seedCase(db);
    for (const title of ["A", "B", "C"]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- positions in order
      await runDomain(
        createTaskEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          title,
        })
      );
    }
    const read = (cap: number) =>
      runDomain(
        listCappedEffect({
          def: taskList,
          repo: taskListRepo,
          scope: { caseId: cased.id },
          query: taskList.queryOf({ sort: "position.asc" }),
          cap,
          toItems: (rows) => Effect.succeed(rows.map((row) => row.title)),
        })
      );
    expect(await read(2)).toEqual({ items: ["A", "B"], isTruncated: true });
    expect(await read(3)).toEqual({
      items: ["A", "B", "C"],
      isTruncated: false,
    });
  });
});
