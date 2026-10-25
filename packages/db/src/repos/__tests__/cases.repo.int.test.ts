import { describe, it, expect } from "vitest";

import type { CaseDeletionEvent } from "@watchdog/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  seedCase,
  seedEntity,
  seedEvidence,
  withSystemHistoryContext,
  withTestTx,
} from "@watchdog/test-db";

import type { DbExec } from "../../exec.ts";
import { activityLogRepo } from "../activity-log.repo.ts";
import { caseDeletionRecordsRepo } from "../case-deletion-records.repo.ts";
import { casesRepo, type CaseRow } from "../cases.repo.ts";
import { entitiesRepo } from "../entities.repo.ts";

/** The record the database demands in the transaction of a lifecycle change (`0001_database_logic`). */
async function log(
  tx: DbExec,
  row: CaseRow,
  event: CaseDeletionEvent
): Promise<void> {
  await caseDeletionRecordsRepo.append(tx, {
    caseId: row.id,
    organizationId: row.organizationId,
    caseName: row.name,
    caseSlug: row.slug,
    event,
    actorId: null,
    actorLabel: null,
  });
}

type Deletion = { deletedAt: Date; deletedBy: string | null; purgeAfter: Date };

async function tombstone(tx: DbExec, row: CaseRow, values: Deletion) {
  await log(tx, row, "deleted");
  return casesRepo.tombstone(tx, row.id, row.organizationId, values);
}

/** A deletion at `deletedAt` that the scheduled purge takes 30 days later. */
function deletedOn(iso: string): Deletion {
  const deletedAt = new Date(iso);
  return {
    deletedAt,
    deletedBy: null,
    purgeAfter: new Date(deletedAt.getTime() + 30 * 86_400_000),
  };
}

describe("casesRepo", () => {
  it("returns the created case from getById and list", async () => {
    await withTestTx(async (tx) => {
      const created = await seedCase(tx, { slug: "alpha-case" });
      const byId = await casesRepo.getById(
        tx,
        created.id,
        created.organizationId
      );
      expect(byId?.id).toBe(created.id);
      expect(byId?.slug).toBe("alpha-case");

      const listed = await casesRepo.list(tx, created.organizationId);
      expect(listed.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("lists the Case ids of every organization for the worker re-scan", async () => {
    await withTestTx(async (tx) => {
      const mine = await seedCase(tx, { slug: "mine" });
      const theirs = await seedCase(tx, {
        slug: "theirs",
        organizationId: TEST_OTHER_ORGANIZATION_ID,
      });
      const ids = await casesRepo.listAllIdsUnchecked(tx);
      expect(ids).toEqual(expect.arrayContaining([mine.id, theirs.id]));
      expect(await casesRepo.listIds(tx, TEST_ORGANIZATION_ID)).not.toContain(
        theirs.id
      );
    });
  });

  it("throws when creating a second case with a unique slug", async () => {
    await withTestTx(async (tx) => {
      await seedCase(tx, { slug: "taken-slug" });
      await expect(
        casesRepo.create(tx, {
          name: "Other Case",
          slug: "taken-slug",
          description: null,
          organizationId: TEST_ORGANIZATION_ID,
        })
      ).rejects.toThrow();
    });
  });

  it("getBySlug slugifies display-style names", async () => {
    await withTestTx(async (tx) => {
      const created = await seedCase(tx, {
        name: "Alpha Investigation",
        slug: "alpha-investigation",
      });
      const row = await casesRepo.getBySlug(
        tx,
        "Alpha Investigation",
        created.organizationId
      );
      expect(row?.id).toBe(created.id);
    });
  });

  describe("tombstone (#304)", () => {
    const deletion: Deletion = {
      ...deletedOn("2026-10-01T00:00:00Z"),
      deletedBy: "u1",
    };

    it("is skipped by every reader of cases and every join that scopes by Case", async () => {
      await withTestTx(async (tx) => {
        const live = await seedCase(tx, { slug: "live", name: "Alpha live" });
        const gone = await seedCase(tx, { slug: "gone", name: "Alpha gone" });
        const entity = await seedEntity(tx, gone.id);
        await seedEvidence(tx, gone.id);
        const org = gone.organizationId;
        await tombstone(tx, gone, deletion);

        expect((await casesRepo.list(tx, org)).map((row) => row.id)).toEqual([
          live.id,
        ]);
        expect(await casesRepo.listIds(tx, org)).toEqual([live.id]);
        expect(await casesRepo.listAllIdsUnchecked(tx)).not.toContain(gone.id);
        expect(
          (await casesRepo.search(tx, org, "Alpha", 10)).map((row) => row.id)
        ).toEqual([live.id]);
        expect(await casesRepo.getById(tx, gone.id, org)).toBeNull();
        expect(await casesRepo.getByIdUnchecked(tx, gone.id)).toBeNull();
        expect(await casesRepo.lockById(tx, gone.id)).toBeNull();
        expect(await casesRepo.getBySlug(tx, "gone", org)).toBeNull();
        expect(
          await casesRepo.update(tx, gone.id, org, { name: "X" })
        ).toBeNull();
        // Joins: the Entity's Case, the activity feed and the org-scoped replay.
        expect(await entitiesRepo.getWithCase(tx, entity.id)).toBeNull();
        const feed = await activityLogRepo.recentFeed(tx, {
          organizationId: org,
          filters: [
            { kind: "evidence", actions: ["captured"] },
            { kind: "entity", actions: ["created"] },
          ],
          limit: 50,
        });
        expect(feed.some((row) => row.caseId === gone.id)).toBe(false);
        const replay = await activityLogRepo.drain(tx, {
          after: { xid: "0", id: 0 },
          limit: 100,
          organizationId: org,
        });
        expect(replay.some((row) => row.caseId === gone.id)).toBe(false);
      });
    });

    it("tombstones once, lists newest first, restores, and refuses a restore after the purge began", async () => {
      await withTestTx(async (tx) => {
        const first = await seedCase(tx, { slug: "first" });
        const second = await seedCase(tx, { slug: "second" });
        const org = first.organizationId;
        expect(await tombstone(tx, first, deletion)).not.toBeNull();
        expect(await tombstone(tx, first, deletion)).toBeNull();
        await tombstone(tx, second, deletedOn("2026-10-02T00:00:00Z"));

        const page = await casesRepo.listDeletedPage(tx, org, { limit: 10 });
        expect(page.map((row) => row.slug)).toEqual(["second", "first"]);
        expect(page[1]).toMatchObject({
          deletedBy: "u1",
          purgeStartedAt: null,
          purgeAfter: deletion.purgeAfter,
        });
        const next = await casesRepo.listDeletedPage(tx, org, {
          limit: 10,
          after: { deletedAt: page[0]!.deletedAt, id: page[0]!.id },
        });
        expect(next.map((row) => row.slug)).toEqual(["first"]);
        expect((await casesRepo.getDeletedBySlug(tx, "first", org))?.id).toBe(
          first.id
        );
        expect(await casesRepo.getDeletedBySlug(tx, "nope", org)).toBeNull();
        expect(
          await casesRepo.listDeletedPage(tx, TEST_OTHER_ORGANIZATION_ID, {
            limit: 10,
          })
        ).toEqual([]);

        await log(tx, first, "restored");
        expect(
          await casesRepo.restoreDeleted(tx, first.id, org)
        ).not.toBeNull();
        expect((await casesRepo.getById(tx, first.id, org))?.slug).toBe(
          "first"
        );
        expect(await casesRepo.restoreDeleted(tx, first.id, org)).toBeNull();

        await log(tx, second, "purge_started");
        await casesRepo.markDeletedPurgeStarted(tx, second.id, new Date());
        expect(await casesRepo.restoreDeleted(tx, second.id, org)).toBeNull();
      });
    });

    it("restores under a given slug, clearing the purge date", async () => {
      await withTestTx(async (tx) => {
        const row = await seedCase(tx, { slug: "old-slug" });
        await tombstone(tx, row, deletion);
        await log(tx, row, "restored");
        const restored = await casesRepo.restoreDeleted(
          tx,
          row.id,
          row.organizationId,
          { slug: "new-slug" }
        );
        expect(restored?.slug).toBe("new-slug");
        const [after] = await casesRepo.listDeletedPage(
          tx,
          row.organizationId,
          { limit: 10 }
        );
        expect(after).toBeUndefined();
      });
    });

    it("allows the slug of a deleted Case to be taken, and keeps it unique among visible Cases", async () => {
      await withTestTx(async (tx) => {
        const old = await seedCase(tx, { slug: "shared" });
        await tombstone(tx, old, deletion);
        const taker = await seedCase(tx, { slug: "shared" });
        expect(taker.id).not.toBe(old.id);
        await expect(seedCase(tx, { slug: "shared" })).rejects.toThrow();
      });
    });

    it("offers Cases whose last purge failed after the fresh ones, so failures cannot starve later Cases", async () => {
      await withTestTx(async (tx) => {
        const org = TEST_ORGANIZATION_ID;
        const failing = await seedCase(tx, { slug: "failing" });
        const fresh = await seedCase(tx, { slug: "fresh-due" });
        await tombstone(tx, failing, deletedOn("2026-01-01T00:00:00Z"));
        await tombstone(tx, fresh, deletedOn("2026-02-01T00:00:00Z"));
        await log(tx, failing, "purge_started");
        await casesRepo.markDeletedPurgeStarted(tx, failing.id, new Date());
        await log(tx, failing, "purge_failed");
        await casesRepo.recordDeletedPurgeError(tx, failing.id, "store down");
        const now = new Date("2026-09-01T00:00:00Z");

        expect(org).toBe(failing.organizationId);
        expect(
          await casesRepo.listDeletedPurgeDueIds(tx, { now, limit: 1 })
        ).toEqual([fresh.id]);
        expect(
          await casesRepo.listDeletedPurgeDueIds(tx, { now, limit: 5 })
        ).toEqual([fresh.id, failing.id]);
      });
    });

    it("purges only a tombstone, and offers the due ones: past their stored purge date or already begun", async () => {
      await withTestTx(async (tx) => {
        const live = await seedCase(tx, { slug: "live" });
        const old = await seedCase(tx, { slug: "old" });
        const fresh = await seedCase(tx, { slug: "fresh" });
        const begun = await seedCase(tx, { slug: "begun" });
        await tombstone(tx, old, deletedOn("2026-01-01T00:00:00Z"));
        await tombstone(tx, fresh, deletedOn("2026-10-17T00:00:00Z"));
        await tombstone(tx, begun, deletedOn("2026-10-17T00:00:00Z"));
        await log(tx, begun, "purge_started");
        await casesRepo.markDeletedPurgeStarted(tx, begun.id, new Date());

        const due = await casesRepo.listDeletedPurgeDueIds(tx, {
          now: new Date("2026-10-18T00:00:00Z"),
          limit: 10,
        });
        expect(due).toEqual(expect.arrayContaining([old.id, begun.id]));
        expect(due).not.toContain(fresh.id);
        expect(due).not.toContain(live.id);

        expect(await casesRepo.purgeDeleted(tx, live.id)).toBeNull();
        // A Case delete by the application role needs a history context (#352) and a purged record.
        await log(tx, old, "purged");
        expect(
          await withSystemHistoryContext(tx, (inner) =>
            casesRepo.purgeDeleted(inner, old.id)
          )
        ).not.toBeNull();
        expect(await casesRepo.lockDeletedForPurge(tx, old.id)).toBeNull();
        expect(await casesRepo.lockDeletedForPurge(tx, live.id)).toBeNull();
        expect((await casesRepo.lockDeletedForPurge(tx, fresh.id))?.id).toBe(
          fresh.id
        );
      });
    });

    it("reads a Case in any state with getByIdIncludingDeleted, and a live Case is no tombstone", async () => {
      await withTestTx(async (tx) => {
        const live = await seedCase(tx, { slug: "live" });
        const gone = await seedCase(tx, { slug: "gone" });
        await tombstone(tx, gone, deletion);
        const org = live.organizationId;
        expect(
          (await casesRepo.getByIdIncludingDeleted(tx, live.id, org))?.deletedAt
        ).toBeNull();
        expect(
          (await casesRepo.getByIdIncludingDeleted(tx, gone.id, org))?.deletedAt
        ).toBeInstanceOf(Date);
        expect(
          await casesRepo.getByIdIncludingDeleted(
            tx,
            gone.id,
            TEST_OTHER_ORGANIZATION_ID
          )
        ).toBeNull();
        expect(await casesRepo.lockDeletedForPurge(tx, live.id)).toBeNull();
      });
    });
  });
});
