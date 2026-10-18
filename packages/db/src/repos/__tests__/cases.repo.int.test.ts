import { describe, it, expect } from "vitest";

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

import { activityLogRepo } from "../activity-log.repo.ts";
import { casesRepo } from "../cases.repo.ts";
import { entitiesRepo } from "../entities.repo.ts";

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
    const deletion = {
      deletedAt: new Date("2026-10-01T00:00:00Z"),
      deletedBy: "u1",
    };

    it("is skipped by every reader of cases and every join that scopes by Case", async () => {
      await withTestTx(async (tx) => {
        const live = await seedCase(tx, { slug: "live", name: "Alpha live" });
        const gone = await seedCase(tx, { slug: "gone", name: "Alpha gone" });
        const entity = await seedEntity(tx, gone.id);
        await seedEvidence(tx, gone.id);
        const org = gone.organizationId;
        await casesRepo.tombstone(tx, gone.id, org, deletion);

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
        expect(
          await casesRepo.tombstone(tx, first.id, org, deletion)
        ).not.toBeNull();
        expect(
          await casesRepo.tombstone(tx, first.id, org, deletion)
        ).toBeNull();
        await casesRepo.tombstone(tx, second.id, org, {
          deletedAt: new Date("2026-10-02T00:00:00Z"),
          deletedBy: null,
        });

        const page = await casesRepo.listDeletedPage(tx, org, { limit: 10 });
        expect(page.map((row) => row.slug)).toEqual(["second", "first"]);
        expect(page[1]).toMatchObject({
          deletedBy: "u1",
          purgeStartedAt: null,
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

        expect(await casesRepo.restore(tx, first.id, org)).not.toBeNull();
        expect((await casesRepo.getById(tx, first.id, org))?.slug).toBe(
          "first"
        );
        expect(await casesRepo.restore(tx, first.id, org)).toBeNull();

        await casesRepo.markPurgeStarted(tx, second.id, new Date());
        expect(await casesRepo.restore(tx, second.id, org)).toBeNull();
      });
    });

    it("purges only a tombstone, and offers the due ones: past the window or already begun", async () => {
      await withTestTx(async (tx) => {
        const live = await seedCase(tx, { slug: "live" });
        const old = await seedCase(tx, { slug: "old" });
        const fresh = await seedCase(tx, { slug: "fresh" });
        const begun = await seedCase(tx, { slug: "begun" });
        const org = live.organizationId;
        await casesRepo.tombstone(tx, old.id, org, {
          deletedAt: new Date("2026-01-01T00:00:00Z"),
          deletedBy: null,
        });
        await casesRepo.tombstone(tx, fresh.id, org, {
          deletedAt: new Date("2026-10-17T00:00:00Z"),
          deletedBy: null,
        });
        await casesRepo.tombstone(tx, begun.id, org, {
          deletedAt: new Date("2026-10-17T00:00:00Z"),
          deletedBy: null,
        });
        await casesRepo.markPurgeStarted(tx, begun.id, new Date());

        const due = await casesRepo.listPurgeDueIds(tx, {
          deletedBefore: new Date("2026-09-17T00:00:00Z"),
          limit: 10,
        });
        expect(due).toEqual(expect.arrayContaining([old.id, begun.id]));
        expect(due).not.toContain(fresh.id);
        expect(due).not.toContain(live.id);

        expect(await casesRepo.purge(tx, live.id)).toBeNull();
        // A Case delete by the application role needs a history context (#352).
        expect(
          await withSystemHistoryContext(tx, (inner) =>
            casesRepo.purge(inner, old.id)
          )
        ).not.toBeNull();
        expect(await casesRepo.lockDeletedForPurge(tx, old.id)).toBeNull();
        expect(await casesRepo.lockDeletedForPurge(tx, live.id)).toBeNull();
        expect((await casesRepo.lockDeletedForPurge(tx, fresh.id))?.id).toBe(
          fresh.id
        );
      });
    });
  });
});
