import { beforeEach, describe, expect, it } from "vitest";

import { applyPatchEffect } from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { db, entitiesRepo } from "@watchdog/db";
import { resetTestDb } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { seedGraphFixture, type GraphFixture } from "./graph-mutations";

/**
 * #307 for patch ops (`graph.write` and Triage Accept): a version on an op is optional, which
 * the module's conformance suite (one `expectedVersion` per write) does not cover. The per-table
 * races (two writers, a stale or old version, Evidence replaced) are conformance cases.
 */

describe("optimistic concurrency on patch ops", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("patch ops (graph.write and Triage Accept)", () => {
    const entityUpdate = (
      fx: GraphFixture,
      summary: string,
      version?: number
    ) =>
      applyPatchEffect({
        caseId: fx.caseId,
        channel: "agent_write",
        confidence: "unverified",
        actor: { actorId: TEST_ACTOR_ID },
        patch: [
          {
            op: "update",
            resource: "entity",
            id: fx.entityId,
            data: { summary },
            ...(version === undefined ? {} : { expectedVersion: version }),
          },
        ],
      });

    it("an op without expectedVersion overwrites the row as it stands", async () => {
      const fx = await seedGraphFixture();
      await runDomain(entityUpdate(fx, "one"));
      await runDomain(entityUpdate(fx, "two"));
      const row = await entitiesRepo.getInCase(db, fx.caseId, fx.entityId);
      expect(row?.summary).toBe("two");
      expect(row?.version).toBe(3);
    });

    it("an op with a stale expectedVersion fails the whole patch with stale_version", async () => {
      const fx = await seedGraphFixture();
      await runDomain(entityUpdate(fx, "one"));
      await expect(
        runDomain(entityUpdate(fx, "late", 1))
      ).rejects.toMatchObject({ _tag: "StaleVersionError", currentVersion: 2 });
      expect(
        (await entitiesRepo.getInCase(db, fx.caseId, fx.entityId))?.summary
      ).toBe("one");
    });

    it("an op at the current version applies", async () => {
      const fx = await seedGraphFixture();
      await runDomain(entityUpdate(fx, "one"));
      await runDomain(entityUpdate(fx, "two", 2));
      expect(
        (await entitiesRepo.getInCase(db, fx.caseId, fx.entityId))?.summary
      ).toBe("two");
    });
  });
});
