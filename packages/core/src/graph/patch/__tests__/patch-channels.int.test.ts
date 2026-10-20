import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { applyPatchEffect } from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import {
  db,
  edgesRepo,
  entitiesRepo,
  evidenceLinksRepo,
  identifiersRepo,
} from "@watchdog/db";
import type { GraphActor } from "@watchdog/schemas/shared";
import {
  buildClaimCreateOp,
  buildEdgeCreateOp,
  buildEntityCreateOp,
  buildEventCreateOp,
  buildIdentifierCreateOp,
  buildQuestionCreateOp,
} from "@watchdog/schemas/testing";
import {
  listAllActivity,
  listAllGraphHistory,
  resetTestDb,
  seedEvidence,
  withSystemTestTx,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import { transact } from "../../../infra/postgres-tx";
import {
  seedGraphFixture,
  type GraphFixture,
} from "../../__tests__/graph-mutations";
import { setHistoryContextEffect } from "../../graph-activity";
import { runGraphMutation } from "../../mutation/run-graph-mutation";
import { entitiesTable } from "../../mutation/tables";

/**
 * The patch channels (`triage_accept`, `agent_write`) write through the Graph mutation
 * module's joined path (#423): one activity entry per op with the patch actor, history rows
 * under the caller's context, and `assertPatchGates` in front of every write.
 */

const REVIEWER: GraphActor = {
  actorId: "reviewer-1",
  actorLabel: "api-key:reviewer",
  actorKeyId: "key-reviewer",
};

async function totals() {
  return {
    history: (await listAllGraphHistory()).length,
    activity: (await listAllActivity()).length,
  };
}

/** One create op for every table kind, on top of the fixture's Entities. */
function opsFor(fx: GraphFixture) {
  return [
    buildEntityCreateOp("Patched Org", "patched-org", "infra", {
      id: testId(60),
    }),
    buildClaimCreateOp(fx.entityId, "Patched claim", { id: testId(61) }),
    buildIdentifierCreateOp(fx.entityId, "email", "patched@mailhost.test", {
      id: testId(62),
      data: { platform: "" },
    }),
    buildEventCreateOp(fx.entityId, "1843", "Patched event", {
      id: testId(63),
    }),
    buildQuestionCreateOp(fx.entityId, "Patched question?", { id: testId(64) }),
    buildEdgeCreateOp(fx.entityId, fx.otherEntityId, "same_as", {
      id: testId(65),
    }),
  ];
}

describe.each(["triage_accept", "agent_write"] as const)(
  "patch ops through the Graph mutation module, channel %s",
  (channel) => {
    beforeEach(async () => {
      await resetTestDb();
    });

    it("appends one activity entry per op with the patch actor, and history under the channel", async () => {
      const fx = await seedGraphFixture();
      const ops = opsFor(fx);
      const before = await totals();

      await runDomain(
        applyPatchEffect({
          caseId: fx.caseId,
          channel,
          confidence: "unverified",
          actor: REVIEWER,
          patch: ops,
        })
      );

      const activity = (await listAllActivity()).slice(before.activity);
      const history = (await listAllGraphHistory()).slice(before.history);
      expect(activity.map((entry) => [entry.kind, entry.action])).toEqual([
        ["entity", "created"],
        ["claim", "created"],
        ["identifier", "created"],
        ["event", "created"],
        ["question", "created"],
        ["edge", "created"],
      ]);
      expect(activity.map((entry) => entry.subjectId)).toEqual(
        ops.map((op) => op.id)
      );
      for (const entry of activity) {
        expect(entry).toMatchObject({
          caseId: fx.caseId,
          actorId: REVIEWER.actorId,
          actorLabel: REVIEWER.actorLabel,
          actorKeyId: REVIEWER.actorKeyId,
        });
      }
      expect(history).toHaveLength(ops.length);
      for (const row of history) {
        expect(row).toMatchObject({
          channel,
          actorId: REVIEWER.actorId,
          actorLabel: REVIEWER.actorLabel,
          actorKeyId: REVIEWER.actorKeyId,
        });
      }
    });

    it("joins the caller's transaction: its history context stands, the patch actor is on the entries", async () => {
      const fx = await seedGraphFixture();
      const caller: GraphActor = { actorId: "caller-1", actorLabel: "caller" };
      const before = await totals();

      await runDomain(
        transact((tx) =>
          Effect.gen(function* joinedGen() {
            yield* setHistoryContextEffect(tx, { ...caller, channel });
            yield* applyPatchEffect({
              caseId: fx.caseId,
              // Not the caller's channel and actor: a joined patch must not reset the context.
              channel:
                channel === "agent_write" ? "triage_accept" : "agent_write",
              confidence: "unverified",
              actor: REVIEWER,
              patch: opsFor(fx).slice(0, 2),
              tx,
            });
          })
        )
      );

      const history = (await listAllGraphHistory()).slice(before.history);
      const activity = (await listAllActivity()).slice(before.activity);
      expect(history).toHaveLength(2);
      for (const row of history) {
        expect(row).toMatchObject({ channel, actorId: caller.actorId });
      }
      expect(activity).toHaveLength(2);
      for (const entry of activity) {
        expect(entry).toMatchObject({ actorId: REVIEWER.actorId });
      }
    });

    it("a gated patch writes nothing: the gates refuse before the first op", async () => {
      await withSystemTestTx(async (tx) => {
        const fx = await seedGraphFixture();
        const first = buildEntityCreateOp("Gated Org", "gated-org", "infra", {
          id: testId(70),
        });
        const before = {
          activity: (await listAllActivity(tx)).length,
          history: (await listAllGraphHistory(tx)).length,
        };

        await expect(
          runDomain(
            applyPatchEffect({
              caseId: fx.caseId,
              channel,
              confidence: "confirmed",
              actor: REVIEWER,
              tx,
              patch: [
                first,
                buildClaimCreateOp(fx.entityId, "Needs evidence", {
                  id: testId(71),
                }),
              ],
            })
          )
        ).rejects.toThrow(/confirmed requires/i);

        expect(await entitiesRepo.getById(tx, first.id)).toBeNull();
        expect({
          activity: (await listAllActivity(tx)).length,
          history: (await listAllGraphHistory(tx)).length,
        }).toEqual(before);
      });
    });

    it("an upsert onto an existing Identifier and Edge appends Evidence, never replaces it", async () => {
      const fx = await seedGraphFixture();
      const first = await seedEvidence(db, fx.caseId, { label: "first" });
      const second = await seedEvidence(db, fx.caseId, { label: "second" });
      const identifier = buildIdentifierCreateOp(
        fx.entityId,
        "email",
        "append@mailhost.test",
        { id: testId(80), data: { platform: "" }, evidenceIds: [first.id] }
      );
      const edge = buildEdgeCreateOp(fx.entityId, fx.otherEntityId, "same_as", {
        id: testId(81),
        evidenceIds: [first.id],
      });
      await runDomain(
        applyPatchEffect({
          caseId: fx.caseId,
          channel,
          confidence: "unverified",
          actor: REVIEWER,
          patch: [identifier, edge],
        })
      );

      await runDomain(
        applyPatchEffect({
          caseId: fx.caseId,
          channel,
          confidence: "unverified",
          actor: REVIEWER,
          patch: [
            { ...identifier, op: "upsert", evidenceIds: [second.id] },
            { ...edge, op: "upsert", evidenceIds: [second.id] },
          ],
        })
      );

      const expected = [first.id, second.id].sort();
      const identifierLinks = await evidenceLinksRepo.listForIdentifiers(db, [
        identifier.id,
      ]);
      const edgeLinks = await evidenceLinksRepo.listForEdges(db, [edge.id]);
      expect([...(identifierLinks.get(identifier.id) ?? [])].sort()).toEqual(
        expected
      );
      expect([...(edgeLinks.get(edge.id) ?? [])].sort()).toEqual(expected);
      expect(
        (await identifiersRepo.getInCase(db, fx.caseId, identifier.id))?.version
      ).toBeGreaterThan(1);
      expect(
        (await edgesRepo.getInCase(db, fx.caseId, edge.id))?.version
      ).toBeGreaterThan(1);
    });
  }
);

describe("an Entity insert with a caller-chosen id", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("maps a taken primary key to Conflict with the caller's reason, and writes nothing", async () => {
    const fx = await seedGraphFixture();
    const before = await totals();

    const error = await runDomain(
      runGraphMutation(
        {
          caseId: fx.caseId,
          organizationId: fx.organizationId,
          channel: "agent_write",
        },
        (w) =>
          w.insert(
            entitiesTable,
            { id: fx.entityId, kind: "infra", name: "Clash", slug: "clash" },
            {
              idInUse: {
                uniqueIndex: "entities_pkey",
                conflictReason: "Entity id is already in use",
              },
            }
          )
      ).pipe(
        Effect.flatMap(() => Effect.die(new Error("the insert succeeded"))),
        Effect.flip
      )
    );

    expect(error).toMatchObject({
      _tag: "ConflictError",
      reason: "Entity id is already in use",
    });
    expect(await totals()).toEqual(before);
  });
});
