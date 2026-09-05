import { beforeEach, describe, expect, it } from "vitest";

import {
  acceptProposalEffect,
  createAgentProposalEffect,
  listProposalsForCaseEffect,
  runDomain,
} from "@watchdog/core";
import {
  TEST_ACTOR_ID,
  buildClaimCreateOp,
  testId,
  TEST_ORGANIZATION_ID,
} from "@watchdog/test-kit";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedProposal,
  testDb,
} from "@watchdog/test-kit/db";

describe("proposals", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("lists a seeded proposal and accepts it", async () => {
    const cased = await seedCase(testDb);
    const entity = await seedEntity(testDb, cased.id, { id: testId(20) });
    const { id: proposalId } = await seedProposal(testDb, cased.id, [
      buildClaimCreateOp(entity.id, "Ada observed a host", { id: testId(30) }),
    ]);

    const listed = await runDomain(
      listProposalsForCaseEffect(cased.id, TEST_ORGANIZATION_ID)
    );
    expect(
      listed.some((row) => row.id === proposalId && row.status === "pending")
    ).toBe(true);

    const accepted = await runDomain(
      acceptProposalEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        proposalId,
        actorId: TEST_ACTOR_ID,
        confidence: "unverified",
      })
    );
    expect(accepted.status).toBe("accepted");
  });

  it("lands createAgentProposal as a pending Inbox item", async () => {
    const cased = await seedCase(testDb);
    const entity = await seedEntity(testDb, cased.id, { id: testId(21) });
    const { proposal } = await runDomain(
      createAgentProposalEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        actorId: TEST_ACTOR_ID,
        patch: [
          buildClaimCreateOp(entity.id, "Agent claim", { id: testId(40) }),
        ],
        summary: "from agent",
      })
    );
    expect(proposal.status).toBe("pending");

    const listed = await runDomain(
      listProposalsForCaseEffect(cased.id, TEST_ORGANIZATION_ID, {
        status: "pending",
      })
    );
    expect(listed.some((row) => row.id === proposal.id)).toBe(true);
  });
});
