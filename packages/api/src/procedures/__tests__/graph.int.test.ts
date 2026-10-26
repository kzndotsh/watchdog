import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { listClaimsEffect } from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { writeGraphFromAgentEffect } from "@watchdog/core/proposals";
import { claimList } from "@watchdog/schemas/graph";
import {
  buildClaimCreateOp,
  TEST_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, seedEntity, testDb } from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

describe("graph write (core service)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("writes an unverified claim via the agent escape hatch", async () => {
    const cased = await seedCase(testDb);
    const entity = await seedEntity(testDb, cased.id, { id: testId(20) });
    const written = await runDomain(
      writeGraphFromAgentEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        userOverride: true,
        patch: [
          buildClaimCreateOp(entity.id, "Ada observed a host", {
            id: testId(30),
          }),
        ],
      })
    );
    expect(written.confidence).toBe("unverified");
    expect(written.opCount).toBe(1);
    expect(written.actorLabel).toBe(TEST_ACTOR_ID);
    const claims = await runDomain(
      listClaimsEffect(
        cased.id,
        TEST_ORGANIZATION_ID,
        claimList.input.parse({ caseId: cased.id, entityId: entity.id })
      ).pipe(Effect.map((page) => page.items))
    );
    expect(claims.some((row) => row.text === "Ada observed a host")).toBe(true);
  });
});
