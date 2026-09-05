import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  createTaskEffect,
  deleteTaskEffect,
  listTasksForCaseEffect,
  reorderTasksEffect,
  updateTaskEffect,
  runDomain,
} from "@watchdog/core";
import { activityEventsRepo, db } from "@watchdog/db";
import {
  TEST_ACTOR_ID,
  TEST_ORGANIZATION_ID,
  testId,
} from "@watchdog/test-kit";
import { resetTestDb, seedCase, seedEntity } from "@watchdog/test-kit/db";

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
      listTasksForCaseEffect(cased.id, TEST_ORGANIZATION_ID)
    );
    expect(listed.some((row) => row.id === created.id)).toBe(true);
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
    const events = await activityEventsRepo.recent(db, {
      organizationId: TEST_ORGANIZATION_ID,
      caseId: cased.id,
      limit: 10,
    });
    expect(events.some((row) => row.action === "status_changed")).toBe(true);
    expect(events.every((row) => row.actorId === TEST_ACTOR_ID)).toBe(true);
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
      (error: unknown) => DomainError.is(error) && error.code === "not_found"
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
      listTasksForCaseEffect(cased.id, TEST_ORGANIZATION_ID)
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
    const listed = await runDomain(
      listTasksForCaseEffect(cased.id, TEST_ORGANIZATION_ID, {
        status: "backlog",
      })
    );
    expect(listed.map((row) => row.id)).toEqual([second.id, first.id]);
  });
});
