import { beforeEach, describe, expect, it } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import {
  createIdentifierEffect,
  deleteEntityEffect,
  listGraphHistoryEffect,
  updateEntityFieldsEffect,
  updateIdentifierEffect,
} from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { createTaskEffect } from "@watchdog/core/tasks";
import { activityLogRepo, db, tasksRepo } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  listAllGraphHistory,
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

const REVIEWER = testId(950);
const scope = (caseId: CaseId) => ({
  caseId,
  organizationId: TEST_ORGANIZATION_ID,
  actorId: TEST_ACTOR_ID,
});

describe("Graph history edge cases", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("an Identifier evidence-set change is an update of the row: history and last editor, no activity entry", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id);
    const evidence = await seedEvidence(db, cased.id);
    const identifier = await runDomain(
      createIdentifierEffect({
        ...scope(cased.id),
        entityId: entity.id,
        type: "email",
        value: "ada@mailhost.test",
        confidence: "unverified",
        status: "unknown",
      })
    );
    const entriesBefore = await activityLogRepo.drain(db, {
      after: { xid: "0", id: 0 },
      limit: 1000,
    });
    const historyBefore = await listAllGraphHistory();

    await runDomain(
      updateIdentifierEffect({
        ...scope(cased.id),
        actorId: REVIEWER,
        identifierId: identifier.id,
        evidenceIds: [evidence.id],
      })
    );

    const added = (await listAllGraphHistory()).slice(historyBefore.length);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      kind: "identifier",
      rowId: identifier.id,
      op: "update",
      actorId: REVIEWER,
    });
    expect(added[0]?.before).toMatchObject({
      evidenceIds: [],
      updatedBy: TEST_ACTOR_ID,
    });
    expect(added[0]?.after).toMatchObject({
      evidenceIds: [evidence.id],
      updatedBy: REVIEWER,
    });
    // as before the log: an evidence-only update signals nothing
    expect(
      await activityLogRepo.drain(db, {
        after: { xid: "0", id: 0 },
        limit: 1000,
      })
    ).toHaveLength(entriesBefore.length);

    // the same set again changes nothing and records nothing
    await runDomain(
      updateIdentifierEffect({
        ...scope(cased.id),
        identifierId: identifier.id,
        evidenceIds: [evidence.id],
      })
    );
    expect(await listAllGraphHistory()).toHaveLength(historyBefore.length + 1);
  });

  it("deleting an Entity attributes the Tasks it unlinks to the caller", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id);
    const task = await runDomain(
      createTaskEffect({
        ...scope(cased.id),
        title: "Follow up",
        entityId: entity.id,
      })
    );
    await runDomain(
      deleteEntityEffect(cased.id, TEST_ORGANIZATION_ID, entity.id, {
        actorId: REVIEWER,
      })
    );
    const row = await tasksRepo.getInCase(db, cased.id, task.id);
    expect(row).toMatchObject({
      entityId: null,
      createdBy: TEST_ACTOR_ID,
      updatedBy: REVIEWER,
    });
  });

  it("never reads another Case's row, with or without a cursor", async () => {
    const mine = await seedCase(db, { slug: "mine" });
    const theirs = await seedCase(db, {
      slug: "theirs",
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });
    const foreign = await seedEntity(db, theirs.id);
    const outcome = (cursor?: string) =>
      runDomain(
        listGraphHistoryEffect(TEST_ORGANIZATION_ID, {
          caseId: mine.id,
          kind: "entity",
          rowId: foreign.id,
          limit: 10,
          cursor,
        })
      ).then(
        () => "listed",
        (error: unknown) => (isDomainTag(error) ? error.code : "other")
      );
    expect(await outcome()).toBe("not_found");
    expect(await outcome("1")).toBe("not_found");
    expect(await outcome("999999")).toBe("not_found");
  });
});

describe("Graph history locks", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("editing an Entity while Tasks are created against it never deadlocks", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id);
    const rounds = Array.from({ length: 12 }, (_, index) => index);
    await Promise.all(
      rounds.flatMap((index) => [
        runDomain(
          updateEntityFieldsEffect({
            ...scope(cased.id),
            entityId: entity.id,
            notes: `note ${index}`,
          })
        ),
        runDomain(
          createTaskEffect({
            ...scope(cased.id),
            title: `Task ${index}`,
            entityId: entity.id,
          })
        ),
      ])
    );
    const rows = (await listAllGraphHistory()).filter(
      (row) => row.kind === "entity" && row.rowId === entity.id
    );
    expect(rows).toHaveLength(rounds.length);
    // each edit's before is the previous edit's after: one chain, no fork
    for (const [index, row] of rows.entries()) {
      if (index > 0) expect(row.before).toEqual(rows[index - 1]?.after);
    }
  });
});
