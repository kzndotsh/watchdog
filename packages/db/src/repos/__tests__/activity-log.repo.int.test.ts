import { beforeEach, describe, expect, it } from "vitest";

import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
  testCaseId,
  untrustedCaseId,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedJob,
  seedPlaybookRun,
  seedProposal,
  withTestTx,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import { db } from "../../client.ts";
import { ACTIVITY_CHANNEL, listenOnChannel } from "../../events.ts";
import { activity } from "../../schema/activity.ts";
import { activityLogRepo } from "../activity-log.repo.ts";

const START = { xid: "0", id: 0 } as const;

async function untilTrue(
  check: () => boolean,
  timeoutMs = 3000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    // oxlint-disable-next-line eslint/no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

describe("activityLogRepo", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("appends a row stamped with the writing transaction's xid", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const row = await activityLogRepo.append(tx, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        subjectId: testId(20),
        label: "Follow up",
        toValue: "backlog",
      });
      expect(row).not.toBeNull();
      expect(row?.xid).toMatch(/^\d+$/);
      expect(row?.xid).not.toBe("0");
      expect(row?.id).toBeGreaterThan(0);
    });
  });

  it("rejects an invalid subject id or case id", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      expect(
        await activityLogRepo.append(tx, {
          caseId: cased.id,
          kind: "task",
          action: "created",
          subjectId: "not-a-uuid",
        })
      ).toBeNull();
      expect(
        await activityLogRepo.append(tx, {
          caseId: untrustedCaseId("nope"),
          kind: "task",
          action: "created",
        })
      ).toBeNull();
    });
  });

  it("refuses a label over 200 characters at the database", async () => {
    const cased = await seedCase(db);
    await expect(
      activityLogRepo.append(db, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "x".repeat(201),
      })
    ).rejects.toThrow();
  });

  it("drains rows after a cursor in (xid, id) order, org scoped", async () => {
    const cased = await seedCase(db);
    const first = await activityLogRepo.append(db, {
      caseId: cased.id,
      kind: "task",
      action: "created",
      label: "one",
    });
    const second = await activityLogRepo.append(db, {
      caseId: cased.id,
      kind: "task",
      action: "created",
      label: "two",
    });
    const all = await activityLogRepo.drain(db, { after: START, limit: 10 });
    expect(all.map((row) => row.label)).toEqual(["one", "two"]);

    const afterFirst = await activityLogRepo.drain(db, {
      after: { xid: first?.xid ?? "0", id: first?.id ?? 0 },
      limit: 10,
    });
    expect(afterFirst.map((row) => row.id)).toEqual([second?.id]);

    const scoped = await activityLogRepo.drain(db, {
      after: START,
      limit: 10,
      organizationId: TEST_ORGANIZATION_ID,
      caseId: cased.id,
    });
    expect(scoped).toHaveLength(2);
    const foreign = await activityLogRepo.drain(db, {
      after: START,
      limit: 10,
      organizationId: TEST_ORGANIZATION_ID,
      caseId: testCaseId(99),
    });
    expect(foreign).toEqual([]);
  });

  it("holds back a committed row while an older transaction is still open", async () => {
    const cased = await seedCase(db);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserted: () => void = () => {};
    const insertedRow = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    // T1 takes the lower xid and the lower id, then stays open.
    const older = db.transaction(async (tx) => {
      await activityLogRepo.append(tx, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "older, commits last",
      });
      inserted();
      await held;
    });
    try {
      await insertedRow;
      // T2 takes the higher id and commits first.
      await activityLogRepo.append(db, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "newer, commits first",
      });
      expect(
        await activityLogRepo.drain(db, { after: START, limit: 10 })
      ).toEqual([]);
      expect(await activityLogRepo.hasPast(db, START)).toBe(true);
    } finally {
      release();
      await older;
    }
    const rows = await activityLogRepo.drain(db, { after: START, limit: 10 });
    expect(rows.map((row) => row.label)).toEqual([
      "older, commits last",
      "newer, commits first",
    ]);
    expect(rows[0]?.id).toBeLessThan(rows[1]?.id ?? 0);
  });

  it("reports the newest position, and the safe head", async () => {
    expect(await activityLogRepo.newest(db)).toBeNull();
    expect(await activityLogRepo.head(db)).toEqual(START);
    const cased = await seedCase(db);
    const row = await activityLogRepo.append(db, {
      caseId: cased.id,
      kind: "task",
      action: "created",
    });
    expect(await activityLogRepo.newest(db)).toEqual({
      xid: row?.xid,
      id: row?.id,
    });
    expect(await activityLogRepo.head(db)).toEqual({
      xid: row?.xid,
      id: row?.id,
    });
  });
});

describe("activityLogRepo.recentFeed", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  const JOB_ACTIONS = ["queued", "running", "succeeded"] as const;

  async function appendJob(
    tx: Parameters<typeof activityLogRepo.append>[0],
    caseId: Parameters<typeof activityLogRepo.append>[1]["caseId"],
    subjectId: string,
    action: (typeof JOB_ACTIONS)[number],
    groupId: string | null = null
  ) {
    const row = await activityLogRepo.append(tx, {
      caseId,
      kind: "job",
      action,
      subjectId,
      groupId,
      toValue: action,
    });
    if (row === null) throw new Error("append failed");
    return row;
  }

  it("keeps a solo Job's whole history and one row per group (the newest)", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const solo = testId(40);
      const run = testId(41);
      for (const action of JOB_ACTIONS) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- entries must append in order
        await appendJob(tx, cased.id, solo, action);
      }
      await appendJob(tx, cased.id, testId(42), "queued", run);
      await appendJob(tx, cased.id, testId(42), "succeeded", run);
      const last = await appendJob(tx, cased.id, testId(43), "running", run);

      const rows = await activityLogRepo.recentFeed(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        filters: [{ kind: "job", actions: JOB_ACTIONS }],
        limit: 20,
      });
      expect(rows).toHaveLength(4);
      expect(rows.filter((row) => row.subjectId === solo)).toHaveLength(3);
      const grouped = rows.filter((row) => row.groupId === run);
      expect(grouped.map((row) => row.id)).toEqual([last.id]);
    });
  });

  it("collapses before limiting, so a busy run cannot crowd out other rows", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = testId(41);
      await appendJob(tx, cased.id, testId(50), "queued");
      for (let i = 0; i < 5; i += 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- entries must append in order
        await appendJob(tx, cased.id, testId(51), "running", run);
      }
      const rows = await activityLogRepo.recentFeed(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        filters: [{ kind: "job", actions: JOB_ACTIONS }],
        limit: 2,
      });
      expect(rows.map((row) => row.groupId)).toHaveLength(2);
      expect(rows.map((row) => row.groupId)).toEqual(
        expect.arrayContaining([null, run])
      );
    });
  });

  it("is org scoped and honours the action allowlist", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await appendJob(tx, cased.id, testId(60), "queued");
      const other = await activityLogRepo.recentFeed(tx, {
        organizationId: TEST_OTHER_ORGANIZATION_ID,
        filters: [{ kind: "job", actions: JOB_ACTIONS }],
        limit: 20,
      });
      expect(other).toEqual([]);
      const none = await activityLogRepo.recentFeed(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        filters: [{ kind: "job", actions: ["succeeded"] }],
        limit: 20,
      });
      expect(none).toEqual([]);
    });
  });
  it("reads several kinds in one query, each through its own allowlist", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const append = async (kind: "task" | "evidence", action: string) => {
        const row = await activityLogRepo.append(tx, {
          caseId: cased.id,
          kind,
          action,
          subjectId: testId(70),
        });
        if (row === null) throw new Error("append failed");
        return row;
      };
      await append("task", "updated");
      const created = await append("task", "created");
      const hidden = await append("evidence", "hidden");
      const captured = await append("evidence", "captured");
      const rows = await activityLogRepo.recentFeed(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        filters: [
          { kind: "task", actions: ["created"] },
          { kind: "evidence", actions: ["captured"] },
        ],
        limit: 20,
      });
      expect(rows.map((row) => row.id)).toEqual([captured.id, created.id]);
      expect(rows.map((row) => row.id)).not.toContain(hidden.id);
    });
  });

  it("never returns another organization's entries, with or without a Case filter", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await activityLogRepo.append(tx, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        subjectId: testId(71),
      });
      const filters = [{ kind: "task" as const, actions: ["created"] }];
      expect(
        await activityLogRepo.recentFeed(tx, {
          organizationId: TEST_OTHER_ORGANIZATION_ID,
          filters,
          limit: 20,
        })
      ).toEqual([]);
      expect(
        await activityLogRepo.recentFeed(tx, {
          organizationId: TEST_OTHER_ORGANIZATION_ID,
          caseId: cased.id,
          filters,
          limit: 20,
        })
      ).toEqual([]);
    });
  });
});

describe("activityLogRepo.proposalLabelRows", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("returns the summary, patch and the capability and playbook of the Proposal's Job", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await seedPlaybookRun(tx, cased.id, {
        playbookId: "host-footprint-lite",
      });
      const job = await seedJob(tx, cased.id, {
        playbookRunId: run.id,
        capabilityId: "network.dns.lookup",
      });
      const proposal = await seedProposal(tx, cased.id, [], {
        summary: "s",
        jobId: job.id,
      });
      const plain = await seedProposal(tx, cased.id, [], { summary: null });
      const rows = await activityLogRepo.proposalLabelRows(tx, [
        proposal.id,
        plain.id,
      ]);
      expect(rows.find((row) => row.id === proposal.id)).toMatchObject({
        caseId: cased.id,
        summary: "s",
        capabilityId: "network.dns.lookup",
        playbookId: "host-footprint-lite",
        patch: [],
      });
      expect(rows.find((row) => row.id === plain.id)).toMatchObject({
        capabilityId: null,
        playbookId: null,
      });
      expect(await activityLogRepo.proposalLabelRows(tx, [])).toEqual([]);
    });
  });
});

describe("activity_notify trigger", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("notifies at commit with a small wake-up payload, and not on rollback", async () => {
    const cased = await seedCase(db);
    const payloads: string[] = [];
    let ready = false;
    const listener = listenOnChannel(
      ACTIVITY_CHANNEL,
      (payload) => {
        payloads.push(payload);
      },
      () => {
        ready = true;
      }
    );
    try {
      await untilTrue(() => ready);

      await expect(
        db.transaction(async (tx) => {
          await activityLogRepo.append(tx, {
            caseId: cased.id,
            kind: "task",
            action: "created",
            label: "rolled back",
          });
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");

      const committed = await activityLogRepo.append(db, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "committed",
      });
      await untilTrue(() => payloads.length > 0);
      // Settle: a leaked rollback NOTIFY would have arrived before the commit's.
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      expect(payloads).toHaveLength(1);
      const parsed: unknown = JSON.parse(payloads[0] ?? "null");
      expect(parsed).toEqual({ id: committed?.id, caseId: cased.id });
      expect((payloads[0] ?? "").length).toBeLessThan(120);
      expect(await db.select({ id: activity.id }).from(activity)).toHaveLength(
        1
      );
    } finally {
      await listener.end();
    }
  });
});
