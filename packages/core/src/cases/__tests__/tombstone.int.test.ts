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
import {
  recordingJobQueue,
  type JobQueue,
  listJobsForCaseEffect,
} from "@watchdog/core/jobs";
import {
  activityLogRepo,
  caseDeletionRecordsRepo,
  casesRepo,
  entitiesRepo,
  graphWritesRepo,
  jobsRepo,
  playbookRunsRepo,
} from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  backdateCaseDeletion,
  countLockWaiters,
  listAllGraphHistory,
  listCaseEvidence,
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedGraphWrite,
  seedJob,
  seedOrganizationMember,
  seedPlaybookRun,
  seedProposal,
  startCasePurge,
  testDb,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

const ORG = TEST_ORGANIZATION_ID;
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const MEMBER = "00000000-0000-4000-8000-0000000000b2";
const DAY_MS = 86_400_000;

const store = recordingBlobStore();
const run = runDomainWith(
  Layer.mergeAll(Db.layer, store.layer, recordingJobQueue().layer)
);

const owner = { organizationId: ORG, actorId: TEST_ACTOR_ID };

/** Age a deletion by `days`: both the delete time and the purge date it fixed, as time passing would. */
async function ageDeletion(caseId: CaseId, days: number) {
  const deletedAt = new Date(Date.now() - days * DAY_MS);
  await backdateCaseDeletion(testDb, caseId, {
    deletedAt,
    purgeAfter: new Date(deletedAt.getTime() + 30 * DAY_MS),
  });
}

async function codeOf(
  effect: Effect.Effect<unknown, DomainTag, Db | BlobStore | JobQueue>
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
      expect(
        await codeOf(
          listEntitiesForCaseEffect(cased.id, ORG).pipe(
            Effect.map((page) => page.items)
          )
        )
      ).toBe("not_found");
      expect(
        await codeOf(
          listJobsForCaseEffect(cased.id, ORG).pipe(
            Effect.map((page) => page.items)
          )
        )
      ).toBe("not_found");
      expect(
        await codeOf(
          updateCaseEffect({ id: cased.id, organizationId: ORG, name: "X" })
        )
      ).toBe("not_found");
      expect(
        (
          await run(listCasesEffect(ORG).pipe(Effect.map((page) => page.items)))
        ).map((row) => row.id)
      ).toEqual([other.id]);
      expect(await run(listVisibleCaseIdsEffect(ORG))).toEqual([other.id]);

      // The data is still there: only the purge erases it.
      expect(await entitiesRepo.getById(testDb, entity.id)).not.toBeNull();
      expect(await listCaseEvidence(testDb, cased.id)).toHaveLength(1);
      expect(store.objects.size).toBe(2);
    });

    it("records who deleted it, and cancels queued and running Jobs and the playbook run, in the same transaction", async () => {
      const { cased, queued, running, done, playbookRun } =
        await seedPopulatedCase("gone");

      await run(deleteCaseEffect(cased.id, owner));

      const row = await casesRepo.getByIdIncludingDeleted(
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
      // The cancelled Jobs have their `cancelled` entries, and the Case its own `deleted` entry.
      const entries = await activityLogRepo.drain(testDb, {
        after: { xid: "0", id: 0 },
        limit: 1000,
      });
      expect(
        entries.filter(
          (entry) => entry.kind === "job" && entry.action === "cancelled"
        )
      ).toHaveLength(2);
      expect(
        entries
          .filter((entry) => entry.kind === "case")
          .map((entry) => [entry.action, entry.subjectId, entry.label])
      ).toEqual([["deleted", cased.id, "Case gone"]]);
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

    it("checks the role first, then the Case: a non-manager is forbidden whatever the id, a manager gets not_found for a foreign or already deleted Case", async () => {
      const cased = await seedCase(testDb, { slug: "once" });
      expect(
        await codeOf(
          deleteCaseEffect(cased.id, {
            organizationId: TEST_OTHER_ORGANIZATION_ID,
            actorId: MEMBER,
          })
        )
      ).toBe("forbidden");
      expect(
        await codeOf(
          deleteCaseEffect(cased.id, {
            organizationId: TEST_OTHER_ORGANIZATION_ID,
            actorId: TEST_ACTOR_ID,
          })
        )
      ).toBe("not_found");
      expect(await codeOf(deleteCaseEffect(cased.id, owner))).toBe("ok");
      expect(await codeOf(deleteCaseEffect(cased.id, owner))).toBe("not_found");
    });

    it("frees the slug at once: a new Case can take it while the old one is deleted", async () => {
      const cased = await seedCase(testDb, { slug: "dossier" });
      await run(deleteCaseEffect(cased.id, owner));
      const created = await run(
        createCaseEffect({
          name: "Dossier",
          slug: "dossier",
          organizationId: ORG,
        })
      );
      expect(created.slug).toBe("dossier");
      expect(await codeOf(getCaseBySlugEffect("dossier", ORG))).toBe("ok");
    });

    it("still refuses a second live Case with the same slug", async () => {
      await seedCase(testDb, { slug: "dossier" });
      expect(
        await codeOf(
          createCaseEffect({
            name: "Dossier",
            slug: "dossier",
            organizationId: ORG,
          })
        )
      ).toBe("conflict");
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
        (
          await run(
            listEntitiesForCaseEffect(cased.id, ORG).pipe(
              Effect.map((page) => page.items)
            )
          )
        ).map((row) => row.id)
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

    it("restores under a new slug when a new Case took the old one, and says so", async () => {
      const cased = await seedCase(testDb, { slug: "dossier" });
      await run(deleteCaseEffect(cased.id, owner));
      const taker = await run(
        createCaseEffect({
          name: "Dossier",
          slug: "dossier",
          organizationId: ORG,
        })
      );
      const first = await run(restoreCaseEffect(cased.id, owner));
      expect(first).toMatchObject({
        id: cased.id,
        slug: "dossier-2",
        previousSlug: "dossier",
      });
      expect((await run(getCaseBySlugEffect("dossier", ORG))).id).toBe(
        taker.id
      );
      expect((await run(getCaseBySlugEffect("dossier-2", ORG))).id).toBe(
        cased.id
      );
      // The record names the slug it came back under.
      expect(
        (await caseDeletionRecordsRepo.listForCase(testDb, cased.id)).at(-1)
      ).toMatchObject({ event: "restored", caseSlug: "dossier-2" });

      // An untouched slug is not renamed, and reports no previous slug.
      const calm = await seedCase(testDb, { slug: "calm" });
      await run(deleteCaseEffect(calm.id, owner));
      expect(await run(restoreCaseEffect(calm.id, owner))).toMatchObject({
        slug: "calm",
        previousSlug: null,
      });
    });

    it("records a restored entry in the activity log for other sessions", async () => {
      const cased = await seedCase(testDb, { slug: "echo" });
      await run(deleteCaseEffect(cased.id, owner));
      await run(restoreCaseEffect(cased.id, owner));
      const entries = await activityLogRepo.drain(testDb, {
        after: { xid: "0", id: 0 },
        limit: 1000,
      });
      expect(
        entries
          .filter((entry) => entry.kind === "case")
          .map((entry) => entry.action)
      ).toEqual(["deleted", "restored"]);
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
      await startCasePurge(testDb, cased.id);

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
        canIncludeBreachCredentials: false,
        canManage: true,
        cancellableJobs: 0,
      });
      expect((await policyFor(ADMIN)).canManage).toBe(true);
      expect((await policyFor(MEMBER)).canManage).toBe(false);
      expect((await policyFor()).canManage).toBe(false);
    });

    it("counts the Jobs a delete would cancel, for a manager only, and hides an invisible Case", async () => {
      const { cased } = await seedPopulatedCase("busy");
      const forCase = (actorId: string) =>
        run(
          getDeletionPolicyEffect({
            organizationId: ORG,
            actorId,
            caseId: cased.id,
          })
        );
      // The queued and the running Job; the succeeded one is not cancellable.
      expect((await forCase(ADMIN)).cancellableJobs).toBe(2);
      expect((await forCase(MEMBER)).cancellableJobs).toBe(0);
      expect(
        await codeOf(
          getDeletionPolicyEffect({
            organizationId: TEST_OTHER_ORGANIZATION_ID,
            actorId: TEST_ACTOR_ID,
            caseId: cased.id,
          })
        )
      ).toBe("not_found");
      await run(deleteCaseEffect(cased.id, owner));
      expect(
        await codeOf(
          getDeletionPolicyEffect({
            organizationId: ORG,
            actorId: ADMIN,
            caseId: cased.id,
          })
        )
      ).toBe("not_found");
    });

    it("keeps the purge date fixed at delete time when the window setting changes", async () => {
      const cased = await seedCase(testDb, { slug: "fixed" });
      await run(deleteCaseEffect(cased.id, owner));
      vi.stubEnv("WD_CASE_RETENTION_DAYS", "3");
      try {
        const listed = await run(
          listDeletedCasesEffect({ organizationId: ORG, actorId: ADMIN })
        );
        expect(listed.items[0]?.daysLeft).toBe(30);
        expect(await codeOf(restoreCaseEffect(cased.id, owner))).toBe("ok");
      } finally {
        vi.unstubAllEnvs();
      }
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
      await ageDeletion(first.id, 10);
      await ageDeletion(second.id, 5);

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
      expect(await listCaseEvidence(testDb, cased.id)).toEqual([]);
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
        "purge_started",
        "purged",
      ]);
      const purged = records[2];
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
        await casesRepo.getByIdIncludingDeleted(testDb, cased.id, ORG)
      ).not.toBeNull();
    });

    it("answers conflict, never success, when a restore holds the Case while the purge runs, and leaves it live", async () => {
      const cased = await seedCase(testDb, { slug: "flip" });
      await run(deleteCaseEffect(cased.id, owner));
      let commitRestore: () => void = () => undefined;
      const release = new Promise<void>((resolve) => {
        commitRestore = resolve;
      });
      let restoreHolds: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        restoreHolds = resolve;
      });
      // A restore in flight: it holds the Case's row lock until the test lets it commit.
      const restoring = testDb.transaction(async (tx) => {
        const row = await casesRepo.getByIdIncludingDeleted(tx, cased.id, ORG, {
          lock: "update",
        });
        await caseDeletionRecordsRepo.append(tx, {
          caseId: cased.id,
          organizationId: ORG,
          caseName: row?.name ?? "",
          caseSlug: row?.slug ?? "",
          event: "restored",
          actorId: null,
          actorLabel: null,
        });
        await casesRepo.restoreDeleted(tx, cased.id, ORG);
        restoreHolds();
        await release;
      });
      await held;

      const purging = run(Effect.result(purgeCaseEffect(cased.id, owner)));
      // The purge cannot take the row (skip locked), so it waits on the lock in its re-read: the
      // wait is visible in pg_stat_activity, which is the signal to let the restore commit.
      await vi.waitFor(async () => {
        expect(
          await countLockWaiters(testDb, ["for share", '"cases"'])
        ).toBeGreaterThan(0);
      });
      commitRestore();
      await restoring;

      const result = await purging;
      expect(
        Result.isFailure(result) &&
          isDomainTag(result.failure) &&
          result.failure.code
      ).toBe("conflict");
      expect(await codeOf(getCaseByIdEffect(cased.id, ORG))).toBe("ok");
    });

    it("never deletes a live Case through the repo", async () => {
      const cased = await seedCase(testDb, { slug: "live" });
      expect(await casesRepo.purgeDeleted(testDb, cased.id)).toBeNull();
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
      const runFailing = runDomainWith(
        Layer.mergeAll(Db.layer, failing.layer, recordingJobQueue().layer)
      );

      const first = await runFailing(purgeTombstonedCaseEffect(cased.id, {}));
      expect(first.kind).toBe("failed");
      const stuck = await casesRepo.getByIdIncludingDeleted(
        testDb,
        cased.id,
        ORG
      );
      expect(stuck?.purgeError).toMatch(/Failed to delete the Case artifacts/);
      expect(stuck?.purgeStartedAt).toBeInstanceOf(Date);
      expect(await entitiesRepo.getById(testDb, entity.id)).not.toBeNull();
      expect(await codeOf(restoreCaseEffect(cased.id, owner))).toBe("conflict");
      // Still listed for owners and admins, with the failure visible.
      const listed = await run(
        listDeletedCasesEffect({ organizationId: ORG, actorId: ADMIN })
      );
      expect(listed.items[0]).toMatchObject({ id: cased.id, purging: true });
      expect(listed.items[0]?.purgeError).toMatch(
        /Failed to delete the Case artifacts/
      );

      broken = false;
      const retried = await runFailing(purgeExpiredCasesEffect());
      expect(retried).toEqual({ purged: 1, failed: 0, skipped: 0 });
      expect(await casesRepo.getByIdUnchecked(testDb, cased.id)).toBeNull();
      expect(store.objects.size).toBe(0);
      const events = (
        await caseDeletionRecordsRepo.listForCase(testDb, cased.id)
      ).map((r) => r.event);
      expect(events).toEqual([
        "deleted",
        "purge_started",
        "purge_failed",
        "purged",
      ]);
    });

    it("writes one purge_failed record per distinct failure, not one per retry", async () => {
      const cased = await seedCase(testDb, { slug: "loop" });
      await run(deleteCaseEffect(cased.id, owner));
      const failing = recordingBlobStore({
        respond: ({ command }) => {
          if (command === "ListObjectsV2Command") throw new Error("store down");
          return undefined;
        },
      });
      const runFailing = runDomainWith(
        Layer.mergeAll(Db.layer, failing.layer, recordingJobQueue().layer)
      );
      await runFailing(purgeTombstonedCaseEffect(cased.id, {}));
      await runFailing(purgeTombstonedCaseEffect(cased.id, {}));
      await runFailing(purgeTombstonedCaseEffect(cased.id, {}));
      expect(
        (await caseDeletionRecordsRepo.listForCase(testDb, cased.id)).map(
          (record) => record.event
        )
      ).toEqual(["deleted", "purge_started", "purge_failed"]);
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

      const row = await casesRepo.getByIdIncludingDeleted(
        testDb,
        cased.id,
        ORG
      );
      expect(row?.purgeError).toMatch(/connection reset/);
      expect(await entitiesRepo.getById(testDb, entity.id)).not.toBeNull();
      // No `purged` record was written by the rolled-back step (the failure itself is recorded).
      expect(
        (await caseDeletionRecordsRepo.listForCase(testDb, cased.id)).map(
          (record) => record.event
        )
      ).toEqual(["deleted", "purge_started", "purge_failed"]);
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
        Layer.mergeAll(Db.layer, failing.layer, recordingJobQueue().layer)
      )(Effect.result(purgeCaseEffect(cased.id, owner)));
      expect(
        Result.isFailure(result) &&
          isDomainTag(result.failure) &&
          result.failure.code
      ).toBe("internal");
      const row = await casesRepo.getByIdIncludingDeleted(
        testDb,
        cased.id,
        ORG
      );
      expect(row?.purgeError).toMatch(/Failed to list the Case artifacts/);
      expect(row?.purgeError).not.toMatch(/store down/);
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
      await ageDeletion(expired.id, 31);
      await startCasePurge(testDb, started.id);

      const summary = await run(purgeExpiredCasesEffect());

      expect(summary).toEqual({ purged: 2, failed: 0, skipped: 0 });
      expect(await casesRepo.getByIdUnchecked(testDb, live.id)).not.toBeNull();
      expect(
        await casesRepo.getByIdIncludingDeleted(testDb, fresh.id, ORG)
      ).not.toBeNull();
      expect(
        await casesRepo.getByIdIncludingDeleted(testDb, expired.id, ORG)
      ).toBeNull();
      expect(
        await casesRepo.getByIdIncludingDeleted(testDb, started.id, ORG)
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
      await ageDeletion(cased.id, 40);

      expect(await run(purgeExpiredCasesEffect())).toMatchObject({ purged: 1 });
      expect(await run(purgeExpiredCasesEffect())).toEqual({
        purged: 0,
        failed: 0,
        skipped: 0,
      });
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
          await ageDeletion(cased.id, 40);
          return cased.id;
        })
      );

      const [a, b] = await Promise.all([
        run(purgeExpiredCasesEffect()),
        run(purgeExpiredCasesEffect()),
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
      await ageDeletion(cased.id, 40);
      expect(await codeOf(restoreCaseEffect(cased.id, owner))).toBe("conflict");
      expect(await run(purgeExpiredCasesEffect())).toEqual({
        purged: 1,
        failed: 0,
        skipped: 0,
      });
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
        await casesRepo.getByIdIncludingDeleted(testDb, gone.id, ORG)
      ).toBeNull();
      const liveRecords = await caseDeletionRecordsRepo.listForCase(
        testDb,
        live.id
      );
      expect(
        liveRecords.map((record) => [record.event, record.actorId])
      ).toEqual([
        ["deleted", TEST_ACTOR_ID],
        ["purge_started", TEST_ACTOR_ID],
        ["purged", TEST_ACTOR_ID],
      ]);
    });
  });
});
