import { describe, expect, it } from "vitest";

import {
  listAllGraphHistory,
  listCaseChangesets,
  seedCase,
  withSystemHistoryContext,
  withTestTx,
} from "#test-db";
import type { CaseId } from "@watchdog/domain/schemas/shared";
import { buildClaimCreateOp } from "@watchdog/domain/schemas/testing";
import { TEST_ACTOR_ID, testId } from "@watchdog/domain/test-kit";

import {
  changesetsRepo,
  entitiesRepo,
  setGraphHistoryContext,
} from "../index.ts";
import type { DbExec } from "../index.ts";

const IDEM_INDEX = "changesets_case_actor_idem_uidx";

/** The SQLSTATE and constraint of a failed statement (drizzle wraps the driver error as `cause`). */
function pgError(error: unknown): { code?: string; constraint?: string } {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return {};
    const record = current as {
      code?: unknown;
      constraint_name?: unknown;
      cause?: unknown;
    };
    if (typeof record.code === "string") {
      return {
        code: record.code,
        constraint:
          typeof record.constraint_name === "string"
            ? record.constraint_name
            : undefined,
      };
    }
    current = record.cause;
  }
  return {};
}

const entity = (caseId: CaseId, n: number) => ({
  id: testId(n),
  caseId,
  kind: "person" as const,
  name: `Entity ${n}`,
  slug: `entity-${n}`,
});

async function create(tx: DbExec, caseId: CaseId, n: number) {
  await entitiesRepo.create(tx, entity(caseId, n));
}

describe("changesets (#724)", () => {
  it("the history context inserts the transaction's changeset, and every history row names it", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const id = await setGraphHistoryContext(tx, {
        actorId: TEST_ACTOR_ID,
        actorLabel: "api-key:x",
        actorKeyId: "key-1",
        channel: "dossier",
        changeset: { caseId: cased.id, summary: "two people" },
      });
      await create(tx, cased.id, 20);
      await create(tx, cased.id, 21);

      expect(await listCaseChangesets(tx, cased.id)).toEqual([
        expect.objectContaining({
          id,
          channel: "dossier",
          actorId: TEST_ACTOR_ID,
          actorLabel: "api-key:x",
          actorKeyId: "key-1",
          summary: "two people",
        }),
      ]);
      const history = await listAllGraphHistory(tx);
      expect(history).toHaveLength(2);
      expect(history.every((row) => row.changesetId === id)).toBe(true);
    });
  });

  it("a write with no changeset gets one per Case from the trigger, with the context's channel and actor", async () => {
    await withTestTx(async (tx) => {
      const a = await seedCase(tx, { slug: "a" });
      const b = await seedCase(tx, { slug: "b" });
      await withSystemHistoryContext(tx, async (inner) => {
        await create(inner, a.id, 22);
        await create(inner, a.id, 23);
        await create(inner, b.id, 24);
      });

      const [inA] = await listCaseChangesets(tx, a.id);
      const [inB] = await listCaseChangesets(tx, b.id);
      expect(await listCaseChangesets(tx, a.id)).toHaveLength(1);
      expect(await listCaseChangesets(tx, b.id)).toHaveLength(1);
      expect(inA).toMatchObject({ channel: "system", actorId: null });
      const history = await listAllGraphHistory(tx);
      expect(history.map((row) => [row.caseId, row.changesetId])).toEqual([
        [a.id, inA?.id],
        [a.id, inA?.id],
        [b.id, inB?.id],
      ]);
    });
  });

  it("refuses an agent write changeset without its patch and confidence", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const error = await setGraphHistoryContext(tx, {
        actorId: TEST_ACTOR_ID,
        channel: "agent_write",
        changeset: { caseId: cased.id },
      }).catch((error_: unknown) => error_);
      expect(pgError(error)).toEqual({
        code: "23514",
        constraint: "changesets_agent_write_shape",
      });
    });
  });

  it("finds an agent write by its idempotency key (trimmed) and refuses the key twice", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const agentWrite = {
        actorId: TEST_ACTOR_ID,
        channel: "agent_write" as const,
        changeset: {
          caseId: cased.id,
          confidence: "unverified" as const,
          patch: [buildClaimCreateOp(testId(20), "Ada", { id: testId(30) })],
          idempotencyKey: "k1",
        },
      };
      const id = await setGraphHistoryContext(tx, agentWrite);
      expect(id).not.toBeNull();

      expect(
        await changesetsRepo.findIdByIdempotency(tx, {
          caseId: cased.id,
          actorId: TEST_ACTOR_ID,
          idempotencyKey: "  k1  ",
        })
      ).toBe(id);

      const error = await setGraphHistoryContext(tx, agentWrite).catch(
        (error_: unknown) => error_
      );
      expect(pgError(error)).toEqual({ code: "23505", constraint: IDEM_INDEX });
    });
  });
});
