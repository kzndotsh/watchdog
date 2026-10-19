import { createRouterClient } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";

import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  listAllActivity,
  listAllGraphHistory,
  resetTestDb,
  seedCase,
  seedEntity,
  seedOrganizationMember,
  testDb,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

import type { ApiContext } from "../../context";
import { router } from "../../router";

const KEY_ID = "key-366-api";

const context = {
  headers: new Headers(),
  actor: {
    userId: TEST_ACTOR_ID,
    email: null,
    name: "api-key:cli",
    organizationId: TEST_ORGANIZATION_ID,
  },
  credential: { kind: "apiKey", keyId: KEY_ID },
} satisfies ApiContext;
const client = createRouterClient(router, { context });

/** Activity rows of a kind and action, oldest first. */
async function activityOf(kind: string, action: string) {
  return (await listAllActivity()).filter(
    (row) => row.kind === kind && row.action === action
  );
}

describe("every key-made write records the key id (#366)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(testDb, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "owner",
    });
  });

  it("claims.retract: history and activity", async () => {
    const cased = await seedCase(testDb);
    const entity = await seedEntity(testDb, cased.id, { id: testId(30) });
    const claim = await client.claims.create({
      caseId: cased.id,
      entityId: entity.id,
      text: "Lives in Oslo",
      confidence: "unverified",
      class: "observation",
      userOverride: true,
    });
    await client.claims.retract({
      caseId: cased.id,
      claimId: claim.id,
      kind: "retracted",
      reason: "Wrong person",
      userOverride: true,
    });

    const history = (await listAllGraphHistory()).filter(
      (row) => row.rowId === claim.id && row.op === "retract"
    );
    expect(history).toHaveLength(1);
    expect(history[0]?.actorKeyId).toBe(KEY_ID);
    const retracted = await activityOf("claim", "retracted");
    expect(retracted).toHaveLength(1);
    expect(retracted[0]?.actorKeyId).toBe(KEY_ID);
  });

  it("tasks create, update, reorder and remove: history and activity", async () => {
    const cased = await seedCase(testDb);
    const task = await client.tasks.create({
      caseId: cased.id,
      title: "Check the lease",
    });
    await client.tasks.update({
      caseId: cased.id,
      taskId: task.id,
      title: "Check the lease again",
    });
    await client.tasks.update({
      caseId: cased.id,
      taskId: task.id,
      status: "done",
    });
    await client.tasks.reorder({
      caseId: cased.id,
      status: "done",
      orderedIds: [task.id],
    });
    await client.tasks.remove({ caseId: cased.id, taskId: task.id });

    const rows = (await listAllActivity()).filter((row) => row.kind === "task");
    expect(rows.map((row) => row.action)).toEqual([
      "created",
      "updated",
      "status_changed",
      "reordered",
      "deleted",
    ]);
    expect(rows.filter((row) => row.actorKeyId !== KEY_ID)).toEqual([]);

    const history = (await listAllGraphHistory()).filter(
      (row) => row.rowId === task.id
    );
    expect(history.map((row) => row.op)).toContain("delete");
    expect(history.filter((row) => row.actorKeyId !== KEY_ID)).toEqual([]);
  });

  it("cases.update, remove and restore: activity", async () => {
    const cased = await seedCase(testDb);
    await client.cases.update({ caseId: cased.id, description: "Edited" });
    await client.cases.delete({ caseId: cased.id });
    await client.cases.restore({ caseId: cased.id });

    const rows = (await listAllActivity()).filter((row) => row.kind === "case");
    expect(rows.map((row) => row.action)).toEqual([
      "updated",
      "deleted",
      "restored",
    ]);
    expect(rows.filter((row) => row.actorKeyId !== KEY_ID)).toEqual([]);
  });
});
