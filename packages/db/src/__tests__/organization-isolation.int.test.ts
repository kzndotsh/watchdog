import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import { expectPostgresRefusal, resetTestDb } from "@watchdog/test-db";

import { db } from "../client.ts";
import type { DbExec } from "../exec.ts";
import {
  caseOrganizationIdUnchecked,
  organizationScopedDb,
  setOrganizationContext,
} from "../organization-scope.ts";
import { cases } from "../schema/cases.ts";
import { claims } from "../schema/claims.ts";

/**
 * Row-level security on `cases` and `claims` (#718). `db` is the application role
 * (`DATABASE_URL`), which the policies bind; the owner (`DATABASE_URL_MIGRATE`) seeds both
 * organizations' rows, because it is not subject to them (no FORCE): the maintenance path.
 */
const ownerClient = postgres(process.env.DATABASE_URL_MIGRATE ?? "", {
  max: 1,
  idle_timeout: 5,
  onnotice: () => {},
});
const ownerDb = drizzle(ownerClient);

const ORG_A = TEST_ORGANIZATION_ID;
const ORG_B = TEST_OTHER_ORGANIZATION_ID;

/** A Case, an Entity and a Claim of `organizationId`, written by the owner. */
async function seedOwned(
  organizationId: OrganizationId,
  slug: string
): Promise<CaseId> {
  const rows = await ownerDb.execute<{ id: CaseId }>(sql`
    with c as (
      insert into cases (name, slug, organization_id)
      values (${slug}, ${slug}, ${organizationId})
      returning id
    ), e as (
      insert into entities (case_id, kind, name, slug)
      select c.id, 'person', ${slug}, ${slug} from c
      returning id, case_id
    ), cl as (
      insert into claims (entity_id, case_id, text, confidence)
      select e.id, e.case_id, ${`a claim of ${slug}`}, 'unverified' from e
      returning id
    )
    select c.id from c, cl`);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("seed failed");
  return id;
}

let caseA: CaseId;
let caseB: CaseId;

beforeAll(async () => {
  await resetTestDb();
  caseA = await seedOwned(ORG_A, "org-a-case");
  caseB = await seedOwned(ORG_B, "org-b-case");
});

afterAll(async () => {
  await resetTestDb();
  await ownerClient.end({ timeout: 5 });
});

type Counts = { cases: number; claims: number };

async function countsIn(
  run: (read: (exec: DbExec) => Promise<Counts>) => Promise<Counts>
): Promise<Counts> {
  return run(async (exec) => ({
    cases: (await exec.select({ id: cases.id }).from(cases)).length,
    claims: (await exec.select({ id: claims.id }).from(claims)).length,
  }));
}

describe("organization isolation (row-level security)", () => {
  it("a transaction with no organization reads zero Cases and zero Claims", async () => {
    const seen = await countsIn(async (read) =>
      db.transaction(async (tx) => read(tx))
    );
    expect(seen).toEqual({ cases: 0, claims: 0 });
  });

  it("a statement outside a transaction, with no organization, reads nothing either", async () => {
    const seen = await countsIn(async (read) => read(db));
    expect(seen).toEqual({ cases: 0, claims: 0 });
  });

  it("the owner is not subject to the policies", async () => {
    const [row] = await ownerDb.execute<{ cases: number; claims: number }>(
      sql`select (select count(*)::int from cases) as cases, (select count(*)::int from claims) as claims`
    );
    expect(row).toEqual({ cases: 2, claims: 2 });
  });

  it("a transaction scoped to an organization sees only its Cases and their Claims", async () => {
    const seen = await db.transaction(async (tx) => {
      await setOrganizationContext(tx, ORG_A);
      return {
        cases: await tx.select({ id: cases.id }).from(cases),
        claims: await tx.select({ caseId: claims.caseId }).from(claims),
      };
    });
    expect(seen.cases).toEqual([{ id: caseA }]);
    expect(seen.claims).toEqual([{ caseId: caseA }]);
  });

  it("the scoped handle scopes statements and transactions alike, and ends with them", async () => {
    const scopedB = organizationScopedDb(db, ORG_B);
    expect(await scopedB.select({ id: cases.id }).from(cases)).toEqual([
      { id: caseB },
    ]);
    const inTx = await scopedB.transaction(async (tx) =>
      tx.select({ caseId: claims.caseId }).from(claims)
    );
    expect(inTx).toEqual([{ caseId: caseB }]);
    // The same pooled connections carry nothing over.
    const after = await countsIn(async (read) => read(db));
    expect(after).toEqual({ cases: 0, claims: 0 });
    expect(organizationScopedDb(scopedB, ORG_A)).toBe(
      organizationScopedDb(db, ORG_A)
    );
  });

  it("leaves no organization on a pooled connection after a scoped statement fails", async () => {
    const scopedA = organizationScopedDb(db, ORG_A);
    await expect(scopedA.execute(sql`select 1 / 0`)).rejects.toMatchObject({
      cause: { code: "22012" },
    });
    const settings = await Promise.all(
      Array.from({ length: 20 }, async () =>
        db.execute<{ org: string | null }>(
          sql`select current_setting('watchdog.org_id', true) as org`
        )
      )
    );
    for (const [row] of settings) {
      expect(row?.org ?? "").toBe("");
    }
    expect(await scopedA.select({ id: cases.id }).from(cases)).toEqual([
      { id: caseA },
    ]);
  });

  it("refuses to write a Case or a Claim outside the transaction's organization", async () => {
    await expectPostgresRefusal(
      db.transaction(async (tx) => {
        await setOrganizationContext(tx, ORG_A);
        await tx.insert(cases).values({
          name: "smuggled",
          slug: "smuggled",
          organizationId: ORG_B,
        });
      }),
      { code: "42501" }
    );
    await expectPostgresRefusal(
      db.transaction(async (tx) => {
        await setOrganizationContext(tx, ORG_A);
        const [entity] = await tx.execute<{ id: string }>(
          sql`select id from entities where case_id = ${caseB}`
        );
        await tx.execute(
          sql`select set_config('watchdog.channel', 'system', true)`
        );
        await tx.insert(claims).values({
          entityId: entity?.id ?? "",
          caseId: caseB,
          text: "smuggled",
          confidence: "unverified",
        });
      }),
      { code: "42501" }
    );
  });

  it("copies a Claim's organization from its Case, whatever the insert sent", async () => {
    const stored = await db.transaction(async (tx) => {
      await setOrganizationContext(tx, ORG_A);
      await tx.execute(
        sql`select set_config('watchdog.channel', 'system', true)`
      );
      const [entity] = await tx.execute<{ id: string }>(
        sql`select id from entities where case_id = ${caseA}`
      );
      return tx
        .insert(claims)
        .values({
          entityId: entity?.id ?? "",
          caseId: caseA,
          organizationId: ORG_B,
          text: "forged organization",
          confidence: "unverified",
        })
        .returning({ organizationId: claims.organizationId });
    });
    expect(stored).toEqual([{ organizationId: ORG_A }]);
  });

  it("an update or delete of another organization's Claim touches no row", async () => {
    const touched = await db.transaction(async (tx) => {
      await setOrganizationContext(tx, ORG_A);
      await tx.execute(
        sql`select set_config('watchdog.channel', 'system', true)`
      );
      const updated = await tx
        .update(claims)
        .set({ text: "changed" })
        .where(sql`${claims.caseId} = ${caseB}`)
        .returning({ id: claims.id });
      return updated.length;
    });
    expect(touched).toBe(0);
  });

  it("answers a Case's organization past the policies, for the worker's trusted paths", async () => {
    expect(await caseOrganizationIdUnchecked(db, caseB)).toBe(ORG_B);
    expect(
      await caseOrganizationIdUnchecked(
        db,
        "00000000-0000-4000-8000-000000000000"
      )
    ).toBeNull();
    expect(await caseOrganizationIdUnchecked(db, "not-a-uuid")).toBeNull();
  });
});
