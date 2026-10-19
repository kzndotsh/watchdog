import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  seedCase,
  seedEntity,
  seedEvidence,
  withSystemTestTx,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import type { DbTx } from "../../exec.ts";
import { claims } from "../../schema/claims.ts";
import { evidence } from "../../schema/evidence.ts";
import type { KeysetAfter } from "../_keyset.ts";
import { claimsRepo } from "../claims.repo.ts";
import { evidenceRepo } from "../evidence.repo.ts";

/** Rows within one millisecond of each other: a JavaScript `Date` cannot tell them apart. */
const SAME_MILLISECOND = [
  "2026-01-01T00:00:00.123100Z",
  "2026-01-01T00:00:00.123200Z",
  "2026-01-01T00:00:00.123300Z",
  "2026-01-01T00:00:00.123400Z",
  "2026-01-01T00:00:00.123500Z",
];

const byText = (a: string, b: string) => (a < b ? -1 : 1);

async function seedClaims(tx: DbTx, count: number) {
  const cased = await seedCase(tx);
  const entity = await seedEntity(tx, cased.id, { id: testId(20) });
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- insertion order is part of the test
    const row = await claimsRepo.create(tx, {
      entityId: entity.id,
      caseId: cased.id,
      text: `claim ${i}`,
      class: "observation",
      confidence: "unverified",
    });
    if (!row) throw new Error("claim");
    ids.push(row.id);
  }
  return { cased, entity, ids };
}

async function pageClaims(tx: DbTx, entityId: string, limit: number) {
  const seen: string[] = [];
  let after: KeysetAfter | undefined;
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page starts after the last row of the one before
    const rows = await claimsRepo.listForEntity(tx, entityId, {
      limit,
      ...(after === undefined ? {} : { after }),
    });
    seen.push(...rows.map((row) => row.id));
    const last = rows.at(-1);
    if (rows.length < limit || last === undefined) return seen;
    after = { id: last.id, values: [last.createdAt.toISOString()] };
  }
}

describe("keyset pagination", () => {
  it("pages rows that differ only by microseconds without a repeat or a gap", async () => {
    await withSystemTestTx(async (tx) => {
      const { entity, ids } = await seedClaims(tx, SAME_MILLISECOND.length);
      for (const [index, id] of ids.entries()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one row at a time
        await tx
          .update(claims)
          .set({ createdAt: sql`${SAME_MILLISECOND[index]}::timestamptz` })
          .where(eq(claims.id, id));
      }
      // Oldest first: the order they were stamped, whichever ids they drew.
      expect(await pageClaims(tx, entity.id, 1)).toEqual(ids);
      expect(await pageClaims(tx, entity.id, 2)).toEqual(ids);
    });
  });

  it("pages rows that share one timestamp by id", async () => {
    await withSystemTestTx(async (tx) => {
      // One transaction: every row has the transaction's `now()`.
      const { entity, ids } = await seedClaims(tx, 5);
      const whole = await pageClaims(tx, entity.id, 100);
      expect(new Set(whole)).toEqual(new Set(ids));
      expect(whole).toEqual([...ids].sort(byText));
      expect(await pageClaims(tx, entity.id, 2)).toEqual(whole);
    });
  });

  it("continues after the row the cursor names was deleted", async () => {
    await withSystemTestTx(async (tx) => {
      const { entity, ids } = await seedClaims(tx, 5);
      for (const [index, id] of ids.entries()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one row at a time
        await tx
          .update(claims)
          .set({ createdAt: sql`${SAME_MILLISECOND[index]}::timestamptz` })
          .where(eq(claims.id, id));
      }
      const first = await claimsRepo.listForEntity(tx, entity.id, { limit: 2 });
      const last = first.at(-1);
      if (last === undefined) throw new Error("page");
      await tx.delete(claims).where(eq(claims.id, last.id));
      const rest = await claimsRepo.listForEntity(tx, entity.id, {
        limit: 10,
        after: { id: last.id, values: [last.createdAt.toISOString()] },
      });
      // The deleted row is gone; what followed it is still there (at worst a same-millisecond
      // neighbour repeats, never a later row skipped).
      for (const id of ids.slice(2)) {
        expect(rest.map((row) => row.id)).toContain(id);
      }
      expect(rest.map((row) => row.id)).not.toContain(last.id);
    });
  });

  it("pages newest first for a descending list (Evidence)", async () => {
    await withSystemTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const ids: string[] = [];
      for (const stamp of SAME_MILLISECOND) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- insertion order is part of the test
        const row = await seedEvidence(tx, cased.id);
        // oxlint-disable-next-line eslint/no-await-in-loop -- one row at a time
        await tx
          .update(evidence)
          .set({ capturedAt: sql`${stamp}::timestamptz` })
          .where(eq(evidence.id, row.id));
        ids.push(row.id);
      }
      const newestFirst = ids
        .map((id, index) => ({ id, index }))
        .sort((a, b) => b.index - a.index)
        .map((entry) => entry.id);
      const seen: string[] = [];
      let after: KeysetAfter | undefined;
      for (;;) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- each page starts after the last row of the one before
        const rows = await evidenceRepo.listForCase(tx, cased.id, {
          page: { limit: 2, ...(after === undefined ? {} : { after }) },
        });
        seen.push(...rows.map((row) => row.id));
        const last = rows.at(-1);
        if (rows.length < 2 || last === undefined) break;
        after = { id: last.id, values: [last.capturedAt.toISOString()] };
      }
      expect(seen).toEqual(newestFirst);
    });
  });

  it("does not read another Case's row through a cursor id", async () => {
    await withSystemTestTx(async (tx) => {
      const mine = await seedClaims(tx, 3);
      const caseB = await seedCase(tx);
      const entityB = await seedEntity(tx, caseB.id, { id: testId(21) });
      const foreign = await claimsRepo.create(tx, {
        entityId: entityB.id,
        caseId: caseB.id,
        text: "foreign",
        class: "observation",
        confidence: "unverified",
      });
      if (!foreign) throw new Error("claim");
      // A cursor naming a foreign row (with a far-future timestamp as the fallback value):
      // the lookup stays in this entity, so the foreign timestamp decides nothing.
      const rows = await claimsRepo.listForEntity(tx, mine.entity.id, {
        limit: 10,
        after: { id: foreign.id, values: ["1999-01-01T00:00:00.000Z"] },
      });
      expect(rows.map((row) => row.id).sort(byText)).toEqual(
        [...mine.ids].sort(byText)
      );
    });
  });
});
