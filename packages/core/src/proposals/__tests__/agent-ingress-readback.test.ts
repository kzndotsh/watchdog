import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  buildEntityCreateOp,
  testCaseId,
  TEST_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

const { suppressAndProposeStageEffect, getProposalForCaseEffect } = vi.hoisted(
  () => ({
    suppressAndProposeStageEffect: vi.fn(),
    getProposalForCaseEffect: vi.fn(),
  })
);

vi.mock("../../graph/patch/guards", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../graph/patch/guards")>();
  return {
    ...actual,
    assertCaseInOrgEffect: (caseId: string) => Effect.succeed(caseId),
  };
});
vi.mock("../../evidence/evidence", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../evidence/evidence")>();
  return { ...actual, assertEvidenceIdsInCaseEffect: () => Effect.void };
});
vi.mock("../../jobs/stages/propose", () => ({ suppressAndProposeStageEffect }));
vi.mock("../proposals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../proposals")>();
  return { ...actual, getProposalForCaseEffect };
});

import { runDomain } from "../../infra/run-domain";
import { createAgentProposalEffect } from "../agent-ingress";

describe("createAgentProposalEffect", () => {
  it("a Proposal that was created but cannot be read back is a server fault", async () => {
    const proposalId = testId(90);
    suppressAndProposeStageEffect.mockReturnValueOnce(
      Effect.succeed({ kept: [{}], suppressedCount: 0, proposalId })
    );
    getProposalForCaseEffect.mockReturnValueOnce(Effect.succeed(null));

    await expect(
      runDomain(
        createAgentProposalEffect({
          caseId: testCaseId(1),
          organizationId: TEST_ORGANIZATION_ID,
          actorId: TEST_ACTOR_ID,
          patch: [
            buildEntityCreateOp("Host A", "host-a", "person", {
              id: testId(91),
            }),
          ],
        })
      )
    ).rejects.toMatchObject({
      _tag: "InternalError",
      code: "internal",
    });
  });
});
