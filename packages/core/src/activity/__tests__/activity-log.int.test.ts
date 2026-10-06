import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ACTIVITY_REPLAY_LIMIT,
  ActivityTailer,
  appendActivityEffect,
  makeActivityTailerLayer,
  replayActivityEffect,
} from "@watchdog/core/activity";
import { InternalError } from "@watchdog/core/errors";
import {
  Db,
  runDomain,
  runDomainWith,
  transact,
  tryDb,
} from "@watchdog/core/infra";
import {
  createTaskEffect,
  deleteTaskEffect,
  reorderTasksEffect,
  updateTaskEffect,
} from "@watchdog/core/tasks";
import {
  activityLogRepo,
  createActivityTailer,
  db,
  tasksRepo,
} from "@watchdog/db";
import {
  createActivityGate,
  parseActivityCursor,
  type ActivityEntry,
} from "@watchdog/schemas/feed";
import { TEST_ORGANIZATION_ID, testCaseId } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

const START = { xid: "0", id: 0 } as const;

async function entries() {
  return activityLogRepo.drain(db, { after: START, limit: 1000 });
}

describe("appendActivityEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("leaves no entry (and no task) when the surrounding write rolls back", async () => {
    const cased = await seedCase(db);
    const failure = new InternalError({ reason: "rollback me" });
    const result = await runDomain(
      transact((tx) =>
        Effect.gen(function* rolledBackWrite() {
          const task = yield* tryDb(() =>
            tasksRepo.create(tx, {
              caseId: cased.id,
              title: "never committed",
              status: "backlog",
            })
          );
          yield* appendActivityEffect(tx, {
            caseId: cased.id,
            kind: "task",
            action: "created",
            subjectId: task?.id ?? null,
            label: "never committed",
            toValue: "backlog",
          });
          return yield* failure;
        })
      ).pipe(Effect.flip)
    );
    expect(result).toBe(failure);
    expect(await entries()).toEqual([]);
    expect(await tasksRepo.listForCase(db, cased.id, {})).toEqual([]);
  });

  it("rejects a verb that is not listed for the kind as an InternalError", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        appendActivityEffect(db, {
          caseId: cased.id,
          kind: "task",
          action: "captured",
        })
      )
    ).rejects.toMatchObject({ _tag: "InternalError" });
    expect(await entries()).toEqual([]);
  });

  it("cuts a label to 200 characters", async () => {
    const cased = await seedCase(db);
    const entry = await runDomain(
      appendActivityEffect(db, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "x".repeat(300),
      })
    );
    expect(entry.label).toHaveLength(200);
    expect(parseActivityCursor(entry.cursor)).not.toBeNull();
  });
});

describe("Task write paths append to the log", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("logs create, status change, plain update, reorder and delete", async () => {
    const cased = await seedCase(db);
    const base = {
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
    } as const;
    const first = await runDomain(
      createTaskEffect({ ...base, title: "First", actorId: TEST_ACTOR_ID })
    );
    const second = await runDomain(
      createTaskEffect({ ...base, title: "Second", actorId: TEST_ACTOR_ID })
    );
    await runDomain(
      updateTaskEffect({
        ...base,
        taskId: first.id,
        status: "in_progress",
        actorId: TEST_ACTOR_ID,
      })
    );
    await runDomain(
      updateTaskEffect({
        ...base,
        taskId: first.id,
        description: "details",
        actorId: TEST_ACTOR_ID,
      })
    );
    await runDomain(
      reorderTasksEffect({
        ...base,
        status: "backlog",
        orderedIds: [second.id],
      })
    );
    await runDomain(
      deleteTaskEffect(cased.id, TEST_ORGANIZATION_ID, second.id, TEST_ACTOR_ID)
    );

    const rows = await entries();
    expect(rows.map((row) => `${row.kind}.${row.action}`)).toEqual([
      "task.created",
      "task.created",
      "task.status_changed",
      "task.updated",
      "task.reordered",
      "task.deleted",
    ]);
    expect(rows[2]).toMatchObject({
      subjectId: first.id,
      fromValue: "backlog",
      toValue: "in_progress",
      actorId: TEST_ACTOR_ID,
      label: "First",
    });
    expect(rows[4]).toMatchObject({ subjectId: null, toValue: "backlog" });
    expect(rows[5]).toMatchObject({ subjectId: second.id, label: "Second" });
    // One transaction per write: every row carries its own xid.
    expect(new Set(rows.map((row) => row.xid)).size).toBe(rows.length);
  });

  it("logs nothing for a rejected write", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        createTaskEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          title: "   ",
        })
      )
    ).rejects.toMatchObject({ _tag: "InvalidError" });
    expect(await entries()).toEqual([]);
  });
});

const TAILER_LAYER = makeActivityTailerLayer((exec) =>
  createActivityTailer({ exec, pollMs: 50, repollMs: 20 })
);

async function waitFor(check: () => boolean, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    // oxlint-disable-next-line eslint/no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

describe("reconnect replay", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("replays the entries missed while disconnected exactly once", async () => {
    const cased = await seedCase(db);
    const base = {
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
    } as const;
    const create = (title: string) =>
      runDomain(createTaskEffect({ ...base, title }));

    const connection1: ActivityEntry[] = [];
    const connection2: ActivityEntry[] = [];

    await runDomainWith(Db.layer)(
      Effect.gen(function* firstConnection() {
        const tailer = yield* ActivityTailer;
        const gate = createActivityGate(null, (entry) => {
          connection1.push(entry);
        });
        const unsubscribe = yield* tailer.subscribe(gate.live);
        gate.open([]);
        yield* Effect.promise(() => create("seen live"));
        yield* Effect.promise(() => waitFor(() => connection1.length === 1));
        // The client is killed here: it stops listening.
        unsubscribe();
      }).pipe(Effect.provide(TAILER_LAYER))
    );
    expect(connection1.map((entry) => entry.label)).toEqual(["seen live"]);
    const lastSeen = parseActivityCursor(connection1[0]?.cursor ?? "");
    expect(lastSeen).not.toBeNull();

    await create("missed one");
    await create("missed two");

    await runDomainWith(Db.layer)(
      Effect.gen(function* reconnect() {
        if (lastSeen === null) return;
        const tailer = yield* ActivityTailer;
        const gate = createActivityGate(lastSeen, (entry) => {
          connection2.push(entry);
        });
        // Subscribe first, then replay: both paths may carry the same entry.
        const unsubscribe = yield* tailer.subscribe(gate.live);
        const replay = yield* replayActivityEffect({
          organizationId: TEST_ORGANIZATION_ID,
          caseId: cased.id,
          after: lastSeen,
        });
        expect(replay.kind).toBe("entries");
        gate.open(replay.kind === "entries" ? replay.entries : []);
        yield* Effect.promise(() => create("after reconnect"));
        yield* Effect.promise(() => waitFor(() => connection2.length >= 3));
        yield* Effect.promise(
          () =>
            new Promise((resolve) => {
              setTimeout(resolve, 150);
            })
        );
        unsubscribe();
      }).pipe(Effect.provide(TAILER_LAYER))
    );

    expect(connection2.map((entry) => entry.label)).toEqual([
      "missed one",
      "missed two",
      "after reconnect",
    ]);
    expect(new Set(connection2.map((entry) => entry.cursor)).size).toBe(3);
  });

  it("asks for a resync when the cursor is ahead of the database", async () => {
    const cased = await seedCase(db);
    await runDomain(
      appendActivityEffect(db, {
        caseId: cased.id,
        kind: "task",
        action: "created",
      })
    );
    const replay = await runDomain(
      replayActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        after: { xid: "999999999999", id: 999_999 },
      })
    );
    expect(replay).toEqual({ kind: "resync" });
  });

  it("asks for a resync when the log is empty but the client holds a cursor", async () => {
    const replay = await runDomain(
      replayActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        after: { xid: "5", id: 5 },
      })
    );
    expect(replay).toEqual({ kind: "resync" });
  });

  it("asks for a resync when the client is more than the replay limit behind", async () => {
    const cased = await seedCase(db);
    for (let i = 0; i < ACTIVITY_REPLAY_LIMIT + 1; i += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      await activityLogRepo.append(db, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: `n${i}`,
      });
    }
    const behind = await runDomain(
      replayActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        after: START,
      })
    );
    expect(behind).toEqual({ kind: "resync" });

    const rows = await entries();
    const near = rows.at(-3);
    const within = await runDomain(
      replayActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        after: { xid: near?.xid ?? "0", id: near?.id ?? 0 },
      })
    );
    expect(within.kind === "entries" ? within.entries : []).toHaveLength(2);
  });

  it("replays only the caller's organization and Case", async () => {
    const cased = await seedCase(db);
    await runDomain(
      appendActivityEffect(db, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "mine",
      })
    );
    const foreignOrg = await runDomain(
      replayActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: testCaseId(77),
        after: START,
      })
    );
    expect(foreignOrg).toEqual({ kind: "entries", entries: [] });
    const own = await runDomain(
      replayActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        after: START,
      })
    );
    expect(
      own.kind === "entries" ? own.entries.map((e) => e.label) : []
    ).toEqual(["mine"]);
  });
});
