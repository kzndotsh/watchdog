import { beforeEach, describe, expect, it } from "vitest";

import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
  untrustedCaseId,
} from "@watchdog/schemas/testing";
import { resetTestDb, seedCase } from "@watchdog/test-db";

import { db } from "../../client.ts";
import { activityLogRepo } from "../activity-log.repo.ts";

const START = { xid: "0", id: 0 } as const;

/** The labels of the activity rows `drain` returns for an organization and optional Case. */
async function drainedLabels(
  organizationId: typeof TEST_ORGANIZATION_ID,
  caseId?: string
) {
  const rows = await activityLogRepo.drain(db, {
    after: START,
    limit: 50,
    organizationId,
    ...(caseId === undefined ? {} : { caseId: untrustedCaseId(caseId) }),
  });
  return rows.map((row) => row.label);
}

describe("orgCaseFilter (through activityLogRepo.drain)", () => {
  let mine: string;
  let sibling: string;

  beforeEach(async () => {
    await resetTestDb();
    const first = await seedCase(db, { organizationId: TEST_ORGANIZATION_ID });
    const second = await seedCase(db, { organizationId: TEST_ORGANIZATION_ID });
    const theirs = await seedCase(db, {
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });
    mine = first.id;
    sibling = second.id;
    for (const [caseId, label] of [
      [first.id, "mine"],
      [second.id, "sibling"],
      [theirs.id, "theirs"],
    ] as const) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- rows are appended in order
      await activityLogRepo.append(db, {
        caseId,
        kind: "task",
        action: "created",
        label,
      });
    }
  });

  it("returns every Case of the organization, never another organization's, without a caseId", async () => {
    expect(await drainedLabels(TEST_ORGANIZATION_ID)).toEqual([
      "mine",
      "sibling",
    ]);
  });

  it("returns only the named Case's rows", async () => {
    expect(await drainedLabels(TEST_ORGANIZATION_ID, mine)).toEqual(["mine"]);
    expect(await drainedLabels(TEST_ORGANIZATION_ID, sibling)).toEqual([
      "sibling",
    ]);
  });

  it("returns a padded UUID's rows", async () => {
    expect(await drainedLabels(TEST_ORGANIZATION_ID, `  ${mine}  `)).toEqual([
      "mine",
    ]);
  });

  it.each(["   ", "case-1", ""])(
    "returns no rows for the blank or invalid caseId %j",
    async (bad) => {
      expect(await drainedLabels(TEST_ORGANIZATION_ID, bad)).toEqual([]);
    }
  );

  it("never returns another organization's Case rows, even by its id", async () => {
    const theirs = await seedCase(db, {
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });
    await activityLogRepo.append(db, {
      caseId: theirs.id,
      kind: "task",
      action: "created",
      label: "theirs too",
    });
    expect(await drainedLabels(TEST_ORGANIZATION_ID, theirs.id)).toEqual([]);
    expect(await drainedLabels(TEST_OTHER_ORGANIZATION_ID, theirs.id)).toEqual([
      "theirs too",
    ]);
  });
});
