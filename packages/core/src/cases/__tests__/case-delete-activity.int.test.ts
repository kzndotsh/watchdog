import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { replayActivityEffect } from "@watchdog/core/activity";
import { recordingBlobStore } from "@watchdog/core/blob";
import { deleteCaseEffect, purgeCaseEffect } from "@watchdog/core/cases";
import { isDomainTag } from "@watchdog/core/errors";
import {
  createEntityEffect,
  assertCaseInOrgEffect,
} from "@watchdog/core/graph";
import { Db, runDomain, runDomainWith } from "@watchdog/core/infra";
import { recordingJobQueue } from "@watchdog/core/jobs";
import { activityLogRepo, db } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedOrganizationMember,
  testDb,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

const START = { xid: "0", id: 0 } as const;
const runWithBlobs = runDomainWith(
  Layer.mergeAll(Db.layer, recordingBlobStore().layer)
);
const caller = { organizationId: TEST_ORGANIZATION_ID, actorId: TEST_ACTOR_ID };

/**
 * A Case delete is a tombstone (#304): its activity entries are not touched, and they leave only
 * with the purge's cascade. The delete itself is not an entry (the deletion record is the trace).
 */
/** The cancel's follow-up needs a queue to advance Playbook runs; a recording one stands in. */
const runWithQueue = runDomainWith(
  Layer.mergeAll(Db.layer, recordingJobQueue().layer)
);

describe("Case delete and the activity log", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(testDb, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "owner",
    });
  });

  it("keeps the Case's entries on delete, drops them only at purge, and leaves other Cases alone", async () => {
    const doomed = await seedCase(db, { slug: "doomed" });
    const kept = await seedCase(db, { slug: "kept" });
    await Promise.all(
      (
        [
          [doomed.id, "ada"],
          [kept.id, "grace"],
        ] as const
      ).map(([caseId, slug]) =>
        runDomain(
          createEntityEffect({
            caseId,
            organizationId: TEST_ORGANIZATION_ID,
            kind: "person",
            name: slug,
            slug,
          })
        )
      )
    );

    await runWithQueue(deleteCaseEffect(doomed.id, caller));

    const afterDelete = await activityLogRepo.drain(db, {
      after: START,
      limit: 1000,
    });
    // The Case's own entries stay, plus the one `deleted` entry other sessions react to.
    expect(afterDelete.map((row) => row.caseId).sort()).toEqual(
      [doomed.id, doomed.id, kept.id].sort()
    );
    expect(
      afterDelete
        .filter((row) => row.kind === "case")
        .map((row) => [row.caseId, row.action])
    ).toEqual([[doomed.id, "deleted"]]);

    await runWithBlobs(purgeCaseEffect(doomed.id, caller));

    const afterPurge = await activityLogRepo.drain(db, {
      after: START,
      limit: 1000,
    });
    expect(afterPurge.map((row) => row.caseId)).toEqual([kept.id]);
  });

  it("a client reconnecting on the deleted Case is refused: the visibility check the SSE route uses is not_found", async () => {
    const doomed = await seedCase(db, { slug: "doomed" });
    await runDomain(
      createEntityEffect({
        caseId: doomed.id,
        organizationId: TEST_ORGANIZATION_ID,
        kind: "person",
        name: "Ada",
        slug: "ada",
      })
    );
    const [seen] = await activityLogRepo.drain(db, { after: START, limit: 10 });
    const other = await seedCase(db, { slug: "other" });
    await runDomain(
      createEntityEffect({
        caseId: other.id,
        organizationId: TEST_ORGANIZATION_ID,
        kind: "person",
        name: "Grace",
        slug: "grace",
      })
    );
    await runWithQueue(deleteCaseEffect(doomed.id, caller));

    await expect(
      runDomain(assertCaseInOrgEffect(doomed.id, TEST_ORGANIZATION_ID))
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
    // The entries still exist (a tombstone keeps them), but a replay for the deleted Case sends
    // none: the replay is scoped to visible Cases, an empty list and not a `resync`.
    const replay = await runDomain(
      replayActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: doomed.id,
        after: { xid: seen!.xid, id: seen!.id },
      })
    );
    expect(replay).toEqual({ kind: "entries", entries: [] });
  });
});
