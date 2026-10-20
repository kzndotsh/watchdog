import { ORPCError, createRouterClient } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";

import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, seedEntity, testDb } from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import type { ApiContext } from "../../context";
import { router } from "../../router";

const client = createRouterClient(router, {
  context: {
    headers: new Headers(),
    actor: {
      userId: "editor",
      email: null,
      name: "editor",
      organizationId: TEST_ORGANIZATION_ID,
    },
    credential: { kind: "session" },
  } satisfies ApiContext,
});

/** #307 through the router: reads return `version`; a stale write is a 409 `stale_version`. */
describe("stale_version over the API", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("two clients read the same Claim version: one wins, the other gets stale_version with the current version", async () => {
    const cased = await seedCase(testDb);
    const caseId = cased.id;
    const entity = await seedEntity(testDb, caseId, { id: testId(20) });
    const claim = await client.claims.create({
      caseId,
      entityId: entity.id,
      text: "Original",
      confidence: "unverified",
      class: "observation",
      userOverride: true,
    });
    const listed = (await client.claims.list({ caseId, entityId: entity.id }))
      .items;
    expect(listed[0]?.version).toBe(claim.version);

    const results = await Promise.allSettled(
      ["A", "B"].map(async (text) =>
        client.claims.update({
          caseId,
          claimId: claim.id,
          expectedVersion: claim.version,
          text,
          userOverride: true,
        })
      )
    );
    const lost = results.filter((r) => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(lost).toHaveLength(1);
    const error: unknown = lost[0]?.reason;
    expect(error).toBeInstanceOf(ORPCError);
    expect(error).toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: "Claim changed since you opened it",
      data: {
        code: "stale_version",
        entity: "Claim",
        id: claim.id,
        currentVersion: claim.version + 1,
      },
    });
  });

  it("an Entity read returns its version and a write at that version succeeds", async () => {
    const cased = await seedCase(testDb);
    const caseId = cased.id;
    const entity = await client.entities.create({
      caseId,
      kind: "person",
      name: "Grace",
      slug: "grace",
    });
    const read = await client.entities.get({ caseId, slug: "grace" });
    expect(read.version).toBe(entity.version);
    const updated = await client.entities.update({
      caseId,
      entityId: entity.id,
      expectedVersion: read.version,
      summary: "Admiral",
    });
    expect(updated.version).toBe(read.version + 1);
  });
});
