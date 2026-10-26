import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { Db, runDomainWith } from "@watchdog/core/infra";
import { proposalList } from "@watchdog/schemas/jobs";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  captureStatements,
  expectNoSeqScanOn,
  resetTestDb,
  seedCase,
  seedEvidence,
  seedProposal,
  testDb,
} from "@watchdog/test-db";

import {
  listProposalQueueEffect,
  listProposalsForCaseEffect,
} from "../proposals";

/**
 * The queue's page (#580) is the same list through a slimmer select: the same rows in the same
 * order for any `q`, filter and sort, but only what a queue row shows, in two statements.
 */
describe("listProposalQueueEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  const claimOp = (n: number) => ({
    op: "create" as const,
    resource: "claim" as const,
    id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
    data: { text: `claim ${String(n)} `.repeat(50) },
  });

  it("answers the list's rows in the list's order with a row's fields and no patch", async () => {
    const theCase = await seedCase(testDb, {
      name: "Queue",
      slug: "queue",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const cited = await seedEvidence(testDb, theCase.id, { label: "Memo" });
    await seedProposal(testDb, theCase.id, [claimOp(1), claimOp(2)], {
      summary: "First memo",
      evidenceIds: [cited.id],
    });
    await seedProposal(testDb, theCase.id, [claimOp(3)], {
      summary: "Second memo",
    });
    await seedProposal(testDb, theCase.id, [claimOp(4)], {
      summary: "Other",
      status: "rejected",
    });
    const run = (query: Record<string, unknown>) => {
      const input = proposalList.input.parse({ caseId: theCase.id, ...query });
      return runDomainWith(Db.layer)(
        Effect.all({
          full: listProposalsForCaseEffect(
            theCase.id,
            TEST_ORGANIZATION_ID,
            input
          ),
          slim: listProposalQueueEffect(
            theCase.id,
            TEST_ORGANIZATION_ID,
            input
          ),
        })
      );
    };

    for (const query of [
      {},
      { q: "memo" },
      { status: ["pending"] },
      { sort: "created.asc", limit: 2 },
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one view at a time
      const { full, slim } = await run(query);
      expect(slim.items.map((item) => item.id)).toEqual(
        full.items.map((item) => item.id)
      );
      expect(slim.nextCursor).toEqual(full.nextCursor);
      expect(slim.total).toEqual(full.total);
    }

    const { full, slim } = await run({ q: "memo", sort: "created.asc" });
    expect(slim.items).toHaveLength(2);
    expect(Object.keys(slim.items[0] ?? {}).sort()).toEqual([
      "capabilityId",
      "createdAt",
      "evidenceCount",
      "id",
      "opCounts",
      "playbookId",
      "status",
      "summary",
    ]);
    expect(slim.items[0]).toMatchObject({
      summary: "First memo",
      opCounts: { claim: 2 },
      evidenceCount: 1,
    });
    expect(slim.items[1]).toMatchObject({
      opCounts: { claim: 1 },
      evidenceCount: 0,
    });
    expect(JSON.stringify(slim).length).toBeLessThan(
      JSON.stringify(full).length / 2
    );
  });

  it("reads the Case guard and one page, through indexes", async () => {
    const theCase = await seedCase(testDb, {
      name: "Queue plan",
      slug: "queue-plan",
      organizationId: TEST_ORGANIZATION_ID,
    });
    await seedProposal(testDb, theCase.id, [claimOp(1)]);
    const { statements } = await captureStatements(() =>
      runDomainWith(Db.layer)(
        listProposalQueueEffect(
          theCase.id,
          TEST_ORGANIZATION_ID,
          proposalList.input.parse({ caseId: theCase.id })
        )
      )
    );
    expect(statements).toHaveLength(2);
    await expectNoSeqScanOn(statements, "proposals");
  });
});
