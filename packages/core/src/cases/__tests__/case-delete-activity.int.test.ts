import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { replayActivityEffect } from "@watchdog/core/activity";
import { recordingBlobStore } from "@watchdog/core/blob";
import { deleteCaseEffect } from "@watchdog/core/cases";
import { isDomainTag } from "@watchdog/core/errors";
import {
  createEntityEffect,
  assertCaseInOrgEffect,
} from "@watchdog/core/graph";
import { Db, runDomain, runDomainWith } from "@watchdog/core/infra";
import { activityLogRepo, db } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase } from "@watchdog/test-db";

const START = { xid: "0", id: 0 } as const;
const runWithBlobs = runDomainWith(
  Layer.mergeAll(Db.layer, recordingBlobStore().layer)
);

describe("Case delete is not logged (ADR-0005 decision 2)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("appends no entry, drops the Case's entries with the cascade and leaves other Cases alone", async () => {
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
    const before = await activityLogRepo.drain(db, {
      after: START,
      limit: 1000,
    });
    expect(before).toHaveLength(2);

    await runWithBlobs(
      deleteCaseEffect(doomed.id, { organizationId: TEST_ORGANIZATION_ID })
    );

    const after = await activityLogRepo.drain(db, {
      after: START,
      limit: 1000,
    });
    expect(after.map((row) => row.caseId)).toEqual([kept.id]);
    expect(after.some((row) => row.kind === "case")).toBe(false);
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
    // Another Case keeps the log past the client's cursor, so the replay below
    // is answerable: over a log emptied behind the cursor it is a `resync`,
    // which the assertion must not mask.
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
    await runWithBlobs(
      deleteCaseEffect(doomed.id, { organizationId: TEST_ORGANIZATION_ID })
    );

    await expect(
      runDomain(assertCaseInOrgEffect(doomed.id, TEST_ORGANIZATION_ID))
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
    // Even a replay that slips through has nothing to send for the deleted Case:
    // an empty entry list, not a `resync` (which would send the client to refetch).
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
