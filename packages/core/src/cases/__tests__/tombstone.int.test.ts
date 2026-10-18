import { Effect, Layer, Result } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordingBlobStore, type BlobStore } from "@watchdog/core/blob";
import {
  createCaseEffect,
  deleteCaseEffect,
  deleteOrganizationCasesEffect,
  getCaseByIdEffect,
  getCaseBySlugEffect,
  getDeletedCaseBySlugEffect,
  getDeletionPolicyEffect,
  listCasesEffect,
  listDeletedCasesEffect,
  listVisibleCaseIdsEffect,
  purgeCaseEffect,
  purgeExpiredCasesEffect,
  purgeTombstonedCaseEffect,
  restoreCaseEffect,
  updateCaseEffect,
} from "@watchdog/core/cases";
import { isDomainTag, type DomainTag } from "@watchdog/core/errors";
import {
  assertCaseInOrgEffect,
  listEntitiesForCaseEffect,
} from "@watchdog/core/graph";
import { Db, runDomainWith } from "@watchdog/core/infra";
import { listJobsForCaseEffect } from "@watchdog/core/jobs";
import {
  activityLogRepo,
  caseDeletionRecordsRepo,
  casesRepo,
  entitiesRepo,
  evidenceRepo,
  graphWritesRepo,
  jobsRepo,
  playbookRunsRepo,
} from "@watchdog/db";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  backdateCaseDeletion,
  listAllGraphHistory,
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedGraphWrite,
  seedJob,
  seedOrganizationMember,
  seedPlaybookRun,
  seedProposal,
  testDb,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

const ORG = TEST_ORGANIZATION_ID;
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const MEMBER = "00000000-0000-4000-8000-0000000000b2";
const DAY_MS = 86_400_000;

const store = recordingBlobStore();
const run = runDomainWith(Layer.mergeAll(Db.layer, store.layer));

const owner = { organizationId: ORG, actorId: TEST_ACTOR_ID };

async function codeOf(
  effect: Effect.Effect<unknown, DomainTag, Db | BlobStore>
) {
  const result = await run(Effect.result(effect));
  if (Result.isSuccess(result)) return "ok";
  return isDomainTag(result.failure) ? result.failure.code : "defect";
}

/** A Case with a Graph, Evidence a Job cites, a Proposal, a playbook run and an agent write. */
async function seedPopulatedCase(slug: string, n = 0) {
  const cased = await seedCase(testDb, { slug, name: `Case ${slug}` });
  const entity = await seedEntity(testDb, cased.id, {
    id: testId(20 + n),
    slug: "alice",
  });
  const evidence = await seedEvidence(testDb, cased.id, {
    kind: "file",
    uri: `${cased.id}/${"a".repeat(64)}/a.txt`,
  });
  store.objects.set(`${cased.id}/${"a".repeat(64)}/a.txt`, new Uint8Array([1]));
  store.objects.set(`${cased.id}/artifacts/b.json`, new Uint8Array([2]));
  const playbookRun = await seedPlaybookRun(testDb, cased.id);
  const queued = await seedJob(testDb, cased.id, {
    status: "queued",
    evidenceIds: [evidence.id],
    playbookRunId: playbookRun.id,
    playbookStep: 0,
  });
  const running = await seedJob(testDb, cased.id, { status: "running" });
  const done = await seedJob(testDb, cased.id, { status: "succeeded" });
  await seedProposal(
    testDb,
    cased.id,
    [
      {
        op: "create",
        resource: "question",
        id: testId(300 + n),
        data: { entityId: entity.id, text: "Who?" },
      },
    ],
    { evidenceIds: [evidence.id] }
  );
  await seedGraphWrite(testDb, cased.id, [
    {
      op: "create",
      resource: "question",
      id: testId(301 + n),
      data: { entityId: entity.id, text: "Seed" },
    },
  ]);
  return { cased, entity, evidence, queued, running, done, playbookRun };
}

describe("Case tombstone (#304)", () => {
  beforeEach(async () => {
    await resetTestDb();
    store.objects.clear();
    await seedOrganizationMember(testDb, {
      organizationId: ORG,
      userId: TEST_ACTOR_ID,
      role: "owner",
    });
    await seedOrganizationMember(testDb, {
      organizationId: ORG,
      userId: ADMIN,
      role: "admin",
    });
    await seedOrganizationMember(testDb, {
      organizationId: ORG,
      userId: MEMBER,
      role: "member",
    });
    await seedOrganizationMember(testDb, {
      organizationId: TEST_OTHER_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "owner",
    });
  });

  describe("delete", () => {
    it("hides the Case from every core read at once, and keeps its data", async () => {
      const { cased, entity } = await seedPopulatedCase("gone");
      const other = await seedCase(testDb, { slug: "stays" });

      await run(deleteCaseEffect(cased.id, owner));

      expect(await codeOf(getCaseByIdEffect(cased.id, ORG))).toBe("not_found");
      expect(await codeOf(getCaseBySlugEffect("gone", ORG))).toBe("not_found");
      expect(await codeOf(assertCaseInOrgEffect(cased.id, ORG))).toBe(
        "not_found"
      );
      expect(await codeOf(listEntitiesForCaseEffect(cased.id, ORG))).toBe(
        "not_found"
      );
      expect(await codeOf(listJobsForCaseEffect(cased.id, ORG))).toBe(
        "not_found"
      );
      expect(
        await codeOf(
          updateCaseEffect({ id: cased.id, organizationId: ORG, name: "X" })
        )
      ).toBe("not_found");
      expect((await run(listCasesEffect(ORG))).map((row) => row.id)).toEqual([
        other.id,
      ]);
      expect(await run(listVisibleCaseIdsEffect(ORG))).toEqual([other.id]);

      // The data is still there: only the purge erases it.
      expect(await entitiesRepo.getById(testDb, entity.id)).not.toBeNull();
      expect(await evidenceRepo.listForCase(testDb, cased.id)).toHaveLength(1);
      expect(store.objects.size).toBe(2);
    });

    it("records who deleted it, and cancels queued and running Jobs and the playbook run, in the same transaction", async () => {
      const { cased, queued, running, done, playbookRun } =
        await seedPopulatedCase("gone");

      await run(deleteCaseEffect(cased.id, owner));

      const row = await casesRepo.lockByIdIncludingDeleted(
        testDb,
        cased.id,
        ORG
      );
      expect(row?.deletedBy).toBe(TEST_ACTOR_ID);
      expect(row?.deletedAt).toBeInstanceOf(Date);
      expect((await jobsRepo.get(testDb, queued.id))?.status).toBe("cancelled");
      expect((await jobsRepo.get(testDb, running.id))?.status).toBe(
        "cancelled"
      );
      expect((await jobsRepo.get(testDb, done.id))?.status).toBe("succeeded");
      expect((await playbookRunsRepo.get(testDb, playbookRun.id))?.status).toBe(
        "cancelled"
      );
      const records = await caseDeletionRecordsRepo.listForCase(
        testDb,
        cased.id
      );
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        event: "deleted",
        organizationId: ORG,
        caseName: "Case gone",
        caseSlug: "gone",
        actorId: TEST_ACTOR_ID,
      });
      // The cancelled Jobs have their `cancelled` entries; the delete itself is no entry.
      const entries = await activityLogRepo.drain(testDb, {
        after: { xid: "0", id: 0 },
        limit: 1000,
      });
      expect(
        entries.filter(
          (entry) => entry.kind === "job" && entry.action === "cancelled"
        )
      ).toHaveLength(2);
      expect(entries.some((entry) => entry.kind === "case")).toBe(false);
    });

    it("rolls the whole delete back when the deletion record cannot be written", async () => {
      const { cased, queued } = await seedPopulatedCase("gone");
      const spy = vi
        .spyOn(caseDeletionRecordsRepo, "append")
        .mockResolvedValueOnce(null);
      try {
        expect(await codeOf(deleteCaseEffect(cased.id, owner))).toBe(
          "internal"
        );
      } finally {
        spy.mockRestore();
      }
      expect(await codeOf(getCaseByIdEffect(cased.id, ORG))).toBe("ok");
      expect((await jobsRepo.get(testDb, queued.id))?.status).toBe("queued");
    });

    it("lets an owner and an admin delete, and refuses a member, a stranger and a caller with no user", async () => {
      const a = await seedCase(testDb, { slug: "a" });
      const b = await seedCase(testDb, { slug: "b" });
      const c = await seedCase(testDb, { slug: "c" });
      expect(
        await codeOf(
          deleteCaseEffect(a.id, { organizationId: ORG, actorId: MEMBER })
        )
      ).toBe("forbidden");
      expect(
        await codeOf(
          deleteCaseEffect(a.id, {
            organizationId: ORG,
            actorId: "00000000-0000-4000-8000-0000000000c3",
          })
        )
      ).toBe("forbidden");
      expect(
        await codeOf(deleteCaseEffect(a.id, { organizationId: ORG }))
      ).toBe("forbidden");
      expect(
        await codeOf(
          deleteCaseEffect(b.id, { organizationId: ORG, actorId: ADMIN })
        )
      ).toBe("ok");
      expect(await codeOf(deleteCaseEffect(c.id, owner))).toBe("ok");
      expect(await codeOf(getCaseByIdEffect(a.id, ORG))).toBe("ok");
    });

    it("answers a foreign or already deleted Case as not_found, before any role check", async () => {
      const cased = await seedCase(testDb, { slug: "once" });
      expect(
        await codeOf(
          deleteCaseEffect(cased.id, {
            organizationId: TEST_OTHER_ORGANIZATION_ID,
            actorId: MEMBER,
          })
        )
      ).toBe("not_found");
      expect(await codeOf(deleteCaseEffect(cased.id, owner))).toBe("ok");
      expect(await codeOf(deleteCaseEffect(cased.id, owner))).toBe("not_found");
    });

    it("keeps the slug taken, so a new Case cannot reuse it until the Case is purged", async () => {
      const cased = await seedCase(testDb, { slug: "dossier" });
      await run(deleteCaseEffect(cased.id, owner));
      expect(
        await codeOf(
          createCaseEffect({
            name: "Dossier",
            slug: "dossier",
            organizationId: ORG,
          })
        )
      ).toBe("conflict");
      await run(purgeCaseEffect(cased.id, owner));
      expect(
        await codeOf(
          createCaseEffect({
            name: "Dossier",
            slug: "dossier",
            organizationId: ORG,
          })
        )
      ).toBe("ok");
    });
  });

  describe("restore", () => {
    it("brings the Case back inside the window with its Graph, Jobs history and a restore record", async () => {
      const { cased, entity } = await seedPopulatedCase("back");
      await run(deleteCaseEffect(cased.id, owner));

      const restored = await run(
        restoreCaseEffect(cased.id, { organizationId: ORG, actorId: ADMIN })
      );

      expect(restored.slug).toBe("back");
      expect(await codeOf(assertCaseInOrgEffect(cased.id, ORG))).toBe("ok");
      expect(await entitiesRepo.getById(testDb, entity.id)).not.toBeNull();
      expect(
        (await run(listEntitiesForCaseEffect(cased.id, ORG))).map(
          (row) => row.id
        )
      ).toEqual([entity.id]);
      const events = (
        await caseDeletionRecordsRepo.listForCase(testDb, cased.id)
      ).map((record) => [record.event, record.actorId]);
      expect(events).toEqual([
        ["deleted", TEST_ACTOR_ID],
        ["restored", ADMIN],
      ]);
      // A restored Case can be deleted again: a second cycle, a second pair of records.
      await run(deleteCaseEffect(cased.id, owner));
      expect(
        await caseDeletionRecordsRepo.listForCase(testDb, cased.id)
      ).toHaveLength(3);
    });

    it("is refused for a member and a stranger, not found for a live or foreign Case", async () => {
      const cased = await seedCase(testDb, { slug: "x" });
      expect(await codeOf(restoreCaseEffect(cased.id, owner))).toBe(
        "not_found"
      );
      await run(deleteCaseEffect(cased.id, owner));
      expect(
        await codeOf(
          restoreCaseEffect(cased.id, { organizationId: ORG, actorId: MEMBER })
        )
      ).toBe("forbidden");
      expect(
        await codeOf(
          restoreCaseEffect(cased.id, {
            organizationId: ORG,
            actorId: "00000000-0000-4000-8000-0000000000c3",
          })
        )
      ).toBe("forbidden");
      // A manager of another organization sees no such Case.
      expect(
        await codeOf(
          restoreCaseEffect(cased.id, {
            organizationId: TEST_OTHER_ORGANIZATION_ID,
            actorId: TEST_ACTOR_ID,
          })
        )
      ).toBe("not_found");
      expect(await codeOf(getCaseByIdEffect(cased.id, ORG))).toBe("not_found");
    });

    it("is a conflict once a purge has begun, and the Case stays purgeable", async () => {
      const cased = await seedCase(testDb, { slug: "midway" });
      await run(deleteCaseEffect(cased.id, owner));
      await casesRepo.markPurgeStarted(testDb, cased.id, new Date());

      expect(await codeOf(restoreCaseEffect(cased.id, owner))).toBe("conflict");
      await run(purgeCaseEffect(cased.id, owner));
      expect(await casesRepo.getByIdUnchecked(testDb, cased.id)).toBeNull();
    });
  });

  describe("deletion policy", () => {
    it("tells an owner and an admin they can manage, a member and a stranger they cannot, with the configured window", async () => {
      const policyFor = (actorId?: string) =>
        run(
          getDeletionPolicyEffect({
            organizationId: ORG,
            ...(actorId === undefined ? {} : { actorId }),
          })
        );
      expect(await policyFor(TEST_ACTOR_ID)).toEqual({
        restoreWindowDays: 30,
        canManage: true,
      });
      expect((await policyFor(ADMIN)).canManage).toBe(true);
      expect((await policyFor(MEMBER)).canManage).toBe(false);
      expect((await policyFor()).canManage).toBe(false);
    });
  });

  describe("deleted Cases list", () => {
    it("lists tombstones newest first with who and when, paginated, to owners and admins only", async () => {
      const first = await seedCase(testDb, { slug: "first", name: "First" });
      const second = await seedCase(testDb, { slug: "second", name: "Second" });
      const third = await seedCase(testDb, { slug: "third", name: "Third" });
      await seedCase(testDb, { slug: "live" });
      await run(deleteCaseEffect(first.id, owner));
      await run(
        deleteCaseEffect(second.id, { organizationId: ORG, actorId: ADMIN })
      );
      await run(deleteCaseEffect(third.id, owner));
      await backdateCaseDeletion(
        testDb,
        first.id,
        new Date(Date.now() - 10 * DAY_MS)
      );
      await backdateCaseDeletion(
        testDb,
        second.id,
        new Date(Date.now() - 5 * DAY_MS)
      );

      const page1 = await run(
        listDeletedCasesEffect({
          organizationId: ORG,
          actorId: ADMIN,
          limit: 2,
        })
      );
      expect(page1.items.map((item) => item.slug)).toEqual(["third", "second"]);
      expect(page1.items[1]).toMatchObject({
        deletedById: ADMIN,
        purging: false,
        purgeError: null,
      });
      expect(page1.items[1]?.daysLeft).toBe(25);
      expect(page1.nextCursor).not.toBeNull();
      const page2 = await run(
        listDeletedCasesEffect({
          organizationId: ORG,
          actorId: ADMIN,
          limit: 2,
          ...(page1.nextCursor === null ? {} : { cursor: page1.nextCursor }),
        })
      );
      expect(page2.items.map((item) => item.slug)).toEqual(["first"]);
      expect(page2.items[0]?.daysLeft).toBe(20);
      expect(page2.nextCursor).toBeNull();

      expect(
        await codeOf(
          listDeletedCasesEffect({ organizationId: ORG, actorId: MEMBER })
        )
      ).toBe("forbidden");
      expect(
        await codeOf(
          listDeletedCasesEffect({
            organizationId: ORG,
            actorId: ADMIN,
            cursor: "nope",
          })
        )
      ).toBe("invalid");
      expect(
        (
          await run(
            listDeletedCasesEffect({
              organizationId: TEST_OTHER_ORGANIZATION_ID,
              actorId: TEST_ACTOR_ID,
            })
          )
        ).items
      ).toEqual([]);
    });

    it("resolves a deleted Case URL for managers only, so a member sees the ordinary not-found", async () => {
      const cased = await seedCase(testDb, { slug: "burned", name: "Burned" });
      await run(deleteCaseEffect(cased.id, owner));

      const seen = await run(
        getDeletedCaseBySlugEffect({
          slug: "burned",
          organizationId: ORG,
          actorId: ADMIN,
        })
      );
      expect(seen).toMatchObject({
        id: cased.id,
        slug: "burned",
        deletedById: TEST_ACTOR_ID,
      });
      expect(
        await codeOf(
          getDeletedCaseBySlugEffect({
            slug: "burned",
            organizationId: ORG,
            actorId: MEMBER,
          })
        )
      ).toBe("not_found");
      expect(
        await codeOf(
          getDeletedCaseBySlugEffect({
            slug: "nope",
            organizationId: ORG,
            actorId: ADMIN,
          })
        )
      ).toBe("not_found");
      await run(restoreCaseEffect(cased.id, owner));
      expect(
        await codeOf(
          getDeletedCaseBySlugEffect({
            slug: "burned",
            organizationId: ORG,
            actorId: ADMIN,
          })
        )
      ).toBe("not_found");
    });
  });

  describe("purge", () => {
    it("erases the Graph, its history, Evidence, Jobs, the activity log and the files, and leaves the deletion record with counts", async () => {
      const { cased, entity } = await seedPopulatedCase("doomed");
      const keeper = await seedPopulatedCase("keeper", 50);
      await run(deleteCaseEffect(cased.id, owner));
      expect(
        (await listAllGraphHistory(testDb)).filter(
          (row) => row.caseId === cased.id
        )
      ).not.toHaveLength(0);

      await run(
        purgeCaseEffect(cased.id, { organizationId: ORG, actorId: ADMIN })
      );

      expect(await casesRepo.getByIdUnchecked(testDb, cased.id)).toBeNull();
      expect(await entitiesRepo.getById(testDb, entity.id)).toBeNull();
      expect(await evidenceRepo.listForCase(testDb, cased.id)).toEqual([]);
      expect(await graphWritesRepo.listForCase(testDb, cased.id)).toEqual([]);
      expect(
        (await listAllGraphHistory(testDb)).filter(
          (row) => row.caseId === cased.id
        )
      ).toEqual([]);
      expect(
        (
          await activityLogRepo.drain(testDb, {
            after: { xid: "0", id: 0 },
            limit: 1000,
          })
        ).filter((row) => row.caseId === cased.id)
      ).toEqual([]);
      // Only the purged Case's objects went; the other Case's stay.
      expect(
        [...store.objects.keys()].every((key) =>
          key.startsWith(keeper.cased.id)
        )
      ).toBe(true);
      expect(store.objects.size).toBe(2);
      expect(
        await casesRepo.getByIdUnchecked(testDb, keeper.cased.id)
      ).not.toBeNull();

      const records = await caseDeletionRecordsRepo.listForCase(
        testDb,
        cased.id
      );
      expect(records.map((record) => record.event)).toEqual([
        "deleted",
        "purged",
      ]);
      const purged = records[1];
      expect(purged).toMatchObject({
        organizationId: ORG,
        caseName: "Case doomed",
        caseSlug: "doomed",
        actorId: ADMIN,
      });
      expect(purged?.counts).toMatchObject({
        entities: 1,
        evidence: 1,
        jobs: 3,
        proposals: 1,
        playbookRuns: 1,
        graphWrites: 1,
      });
      expect(purged?.counts?.graphHistory).toBeGreaterThan(0);
    });

    it("refuses a live Case, a member and a stranger, and answers a foreign Case as not_found", async () => {
      const cased = await seedCase(testDb, { slug: "live" });
      expect(await codeOf(purgeCaseEffect(cased.id, owner))).toBe("conflict");
      await run(deleteCaseEffect(cased.id, owner));
      expect(
        await codeOf(
          purgeCaseEffect(cased.id, { organizationId: ORG, actorId: MEMBER })
        )
      ).toBe("forbidden");
      expect(
        await codeOf(
          purgeCaseEffect(cased.id, {
            organizationId: TEST_OTHER_ORGANIZATION_ID,
            actorId: TEST_ACTOR_ID,
          })
        )
      ).toBe("not_found");
      expect(await casesRepo.getByIdUnchecked(testDb, cased.id)).toBeNull();
      expect(
        await casesRepo.lockByIdIncludingDeleted(testDb, cased.id, ORG)
      ).not.toBeNull();
    });

    it("says so when the Case was restored between the check and the purge, and leaves it live", async () => {
      const cased = await seedCase(testDb, { slug: "flip" });
      await run(deleteCaseEffect(cased.id, owner));
      const original = casesRepo.getIncludingDeleted.bind(casesRepo);
      const spy = vi
        .spyOn(casesRepo, "getIncludingDeleted")
        .mockImplementationOnce(async (exec, id, org) => {
          const row = await original(exec, id, org);
          await casesRepo.restore(exec, id, org);
          return row;
        });
      try {
        expect(await codeOf(purgeCaseEffect(cased.id, owner))).toBe("conflict");
      } finally {
        spy.mockRestore();
      }
      expect(await codeOf(getCaseByIdEffect(cased.id, ORG))).toBe("ok");
    });

    it("never deletes a live Case through the repo", async () => {
      const cased = await seedCase(testDb, { slug: "live" });
      expect(await casesRepo.purge(testDb, cased.id)).toBeNull();
      expect(await casesRepo.getByIdUnchecked(testDb, cased.id)).not.toBeNull();
    });

    it("records a failed erase on the Case, keeps it deleted and unrestorable, and the retry finishes it", async () => {
      const { cased, entity } = await seedPopulatedCase("stuck");
      await run(deleteCaseEffect(cased.id, owner));
      let broken = true;
      const failing = recordingBlobStore({
        objects: store.objects,
        respond: ({ command }) => {
          if (broken && command === "DeleteObjectsCommand") {
            return { Errors: [{ Key: "k", Code: "InternalError" }] };
          }
          return undefined;
        },
      });
      const runFailing = runDomainWith(Layer.mergeAll(Db.layer, failing.layer));

      const first = await runFailing(purgeTombstonedCaseEffect(cased.id, {}));
      expect(first.kind).toBe("failed");
      const stuck = await casesRepo.lockByIdIncludingDeleted(
        testDb,
        cased.id,
        ORG
      );
      expect(stuck?.purgeError).toMatch(/could not be deleted/);
      expect(stuck?.purgeStartedAt).toBeInstanceOf(Date);
      expect(await entitiesRepo.getById(testDb, entity.id)).not.toBeNull();
      expect(await codeOf(restoreCaseEffect(cased.id, owner))).toBe("conflict");
      // Still listed for owners and admins, with the failure visible.
      const listed = await run(
        listDeletedCasesEffect({ organizationId: ORG, actorId: ADMIN })
      );
      expect(listed.items[0]).toMatchObject({ id: cased.id, purging: true });
      expect(listed.items[0]?.purgeError).toMatch(/could not be deleted/);

      broken = false;
      const retried = await runFailing(
        purgeExpiredCasesEffect({ retentionDays: 3650 })
      );
      expect(retried).toEqual({ purged: 1, failed: 0, skipped: 0 });
      expect(await casesRepo.getByIdUnchecked(testDb, cased.id)).toBeNull();
      expect(store.objects.size).toBe(0);
      const events = (
        await caseDeletionRecordsRepo.listForCase(testDb, cased.id)
      ).map((r) => r.event);
      expect(events).toEqual(["deleted", "purged"]);
    });

    it("records a defect in the delete step too: the Case keeps its Graph, shows the failure and stays purgeable", async () => {
      const { cased, entity } = await seedPopulatedCase("crashy");
      await run(deleteCaseEffect(cased.id, owner));
      const spy = vi
        .spyOn(caseDeletionRecordsRepo, "countPurgeContent")
        .mockRejectedValueOnce(new Error("connection reset"));
      try {
        const outcome = await run(purgeTombstonedCaseEffect(cased.id, {}));
        expect(outcome).toMatchObject({ kind: "failed" });
      } finally {
        spy.mockRestore();
      }

      const row = await casesRepo.lockByIdIncludingDeleted(
        testDb,
        cased.id,
        ORG
      );
      expect(row?.purgeError).toMatch(/connection reset/);
      expect(await entitiesRepo.getById(testDb, entity.id)).not.toBeNull();
      // No `purged` record was written by the rolled-back step.
      expect(
        (await caseDeletionRecordsRepo.listForCase(testDb, cased.id)).map(
          (record) => record.event
        )
      ).toEqual(["deleted"]);
      await run(purgeCaseEffect(cased.id, owner));
      expect(await casesRepo.getByIdUnchecked(testDb, cased.id)).toBeNull();
    });

    it("surfaces a failed Purge now as an internal error after recording it", async () => {
      const cased = await seedCase(testDb, { slug: "stuck2" });
      await run(deleteCaseEffect(cased.id, owner));
      const failing = recordingBlobStore({
        respond: ({ command }) => {
          if (command === "ListObjectsV2Command") throw new Error("store down");
          return undefined;
        },
      });
      const result = await runDomainWith(
        Layer.mergeAll(Db.layer, failing.layer)
      )(Effect.result(purgeCaseEffect(cased.id, owner)));
      expect(
        Result.isFailure(result) &&
          isDomainTag(result.failure) &&
          result.failure.code
      ).toBe("internal");
      const row = await casesRepo.lockByIdIncludingDeleted(
        testDb,
        cased.id,
        ORG
      );
      expect(row?.purgeError).toMatch(/store down/);
    });
  });

  describe("scheduled purge", () => {
    it("takes only tombstones past the window (and unfinished purges), never a live or fresh one", async () => {
      const live = await seedCase(testDb, { slug: "live" });
      const fresh = await seedCase(testDb, { slug: "fresh" });
      const expired = await seedCase(testDb, { slug: "expired" });
      const started = await seedCase(testDb, { slug: "started" });
      await run(deleteCaseEffect(fresh.id, owner));
      await run(deleteCaseEffect(expired.id, owner));
      await run(deleteCaseEffect(started.id, owner));
      await backdateCaseDeletion(
        testDb,
        expired.id,
        new Date(Date.now() - 31 * DAY_MS)
      );
      await casesRepo.markPurgeStarted(testDb, started.id, new Date());

      const summary = await run(purgeExpiredCasesEffect({ retentionDays: 30 }));

      expect(summary).toEqual({ purged: 2, failed: 0, skipped: 0 });
      expect(await casesRepo.getByIdUnchecked(testDb, live.id)).not.toBeNull();
      expect(
        await casesRepo.lockByIdIncludingDeleted(testDb, fresh.id, ORG)
      ).not.toBeNull();
      expect(
        await casesRepo.lockByIdIncludingDeleted(testDb, expired.id, ORG)
      ).toBeNull();
      expect(
        await casesRepo.lockByIdIncludingDeleted(testDb, started.id, ORG)
      ).toBeNull();
      const purgedBy = (
        await caseDeletionRecordsRepo.listForCase(testDb, expired.id)
      ).at(-1);
      expect(purgedBy).toMatchObject({
        event: "purged",
        actorId: null,
        actorLabel: "system",
      });
    });

    it("is idempotent: a second run finds nothing", async () => {
      const cased = await seedCase(testDb, { slug: "once" });
      await run(deleteCaseEffect(cased.id, owner));
      await backdateCaseDeletion(
        testDb,
        cased.id,
        new Date(Date.now() - 40 * DAY_MS)
      );

      expect(
        await run(purgeExpiredCasesEffect({ retentionDays: 30 }))
      ).toMatchObject({ purged: 1 });
      expect(await run(purgeExpiredCasesEffect({ retentionDays: 30 }))).toEqual(
        {
          purged: 0,
          failed: 0,
          skipped: 0,
        }
      );
      expect(
        (await caseDeletionRecordsRepo.listForCase(testDb, cased.id)).filter(
          (record) => record.event === "purged"
        )
      ).toHaveLength(1);
    });

    it("is safe to run twice at once: every Case is purged exactly once", async () => {
      const ids = await Promise.all(
        Array.from({ length: 6 }, async (_, i) => {
          const cased = await seedCase(testDb, { slug: `race-${i}` });
          await run(deleteCaseEffect(cased.id, owner));
          await backdateCaseDeletion(
            testDb,
            cased.id,
            new Date(Date.now() - 40 * DAY_MS)
          );
          return cased.id;
        })
      );

      const [a, b] = await Promise.all([
        run(purgeExpiredCasesEffect({ retentionDays: 30 })),
        run(purgeExpiredCasesEffect({ retentionDays: 30 })),
      ]);

      expect(a.failed + b.failed).toBe(0);
      expect(a.purged + b.purged).toBe(6);
      const records = await Promise.all(
        ids.map((id) => caseDeletionRecordsRepo.listForCase(testDb, id))
      );
      for (const caseRecords of records) {
        expect(
          caseRecords.filter((record) => record.event === "purged")
        ).toHaveLength(1);
      }
    });

    it("refuses a restore once the window has passed, even before the job has run", async () => {
      const cased = await seedCase(testDb, { slug: "late" });
      await run(deleteCaseEffect(cased.id, owner));
      await backdateCaseDeletion(
        testDb,
        cased.id,
        new Date(Date.now() - 40 * DAY_MS)
      );
      expect(await codeOf(restoreCaseEffect(cased.id, owner))).toBe("conflict");
      expect(await run(purgeExpiredCasesEffect({ retentionDays: 30 }))).toEqual(
        {
          purged: 1,
          failed: 0,
          skipped: 0,
        }
      );
    });
  });

  describe("organization delete", () => {
    it("tombstones and purges every Case, live or already deleted, naming the owner in the records", async () => {
      const live = await seedCase(testDb, { slug: "live" });
      const gone = await seedCase(testDb, { slug: "gone" });
      await run(deleteCaseEffect(gone.id, owner));

      const removed = await run(
        deleteOrganizationCasesEffect(ORG, { actorId: TEST_ACTOR_ID })
      );

      expect(removed).toBe(2);
      expect(await casesRepo.getByIdUnchecked(testDb, live.id)).toBeNull();
      expect(
        await casesRepo.lockByIdIncludingDeleted(testDb, gone.id, ORG)
      ).toBeNull();
      const liveRecords = await caseDeletionRecordsRepo.listForCase(
        testDb,
        live.id
      );
      expect(
        liveRecords.map((record) => [record.event, record.actorId])
      ).toEqual([
        ["deleted", TEST_ACTOR_ID],
        ["purged", TEST_ACTOR_ID],
      ]);
    });
  });
});
