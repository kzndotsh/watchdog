import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectPostgresRefusal, resetTestDb } from "#test-db";
import type { CaseId, OrganizationId } from "@watchdog/domain/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/domain/schemas/testing";

import { db } from "../client.ts";
import {
  jobOrganizationIdUnchecked,
  organizationScopedDb,
  setOrganizationContext,
} from "../organization-scope.ts";
import { activityLogRepo } from "../repos/activity-log.repo.ts";

/**
 * Row-level security on every Case-scoped table (#719), beside the tracer's proof on `cases` and
 * `claims` (`organization-isolation.int.test.ts`). `db` is the application role, which the
 * policies bind; the owner seeds one row of every table for each of two organizations, because
 * it is not subject to them (no FORCE). A new Case-scoped table fails the catalog check until it
 * has a policy, and the attack list below until it is named in it.
 */
const owner = postgres(process.env.DATABASE_URL_MIGRATE ?? "", {
  max: 1,
  idle_timeout: 5,
  onnotice: () => {},
});

const ORG_A = TEST_ORGANIZATION_ID;
const ORG_B = TEST_OTHER_ORGANIZATION_ID;

/**
 * Every Case-scoped table the application role can read, with one seeded row per organization.
 * The projection's own bookkeeping (`collect_queue_stale`, `collect_queue_case`) has a policy
 * too (the catalog check) but no grant to the application role at all.
 */
const PROTECTED_TABLES = [
  "cases",
  "entities",
  "claims",
  "identifiers",
  "edges",
  "events",
  "questions",
  "tasks",
  "evidence",
  "claim_evidence",
  "identifier_evidence",
  "edge_evidence",
  "playbook_runs",
  "jobs",
  "job_evidence",
  "proposals",
  "proposal_evidence",
  "provider_calls",
  "provider_call_outcomes",
  "evidence_provider_calls",
  "cap_cache",
  "evidence_uploads",
  "finding_suppressions",
  "case_deletion_records",
  "activity",
  "changesets",
  "graph_history",
  "collect_queue",
  "collect_queue_member",
] as const;

type Seeded = { caseId: CaseId; jobId: string };

/** One row of every protected table for `organizationId`, written by the owner in one transaction. */
async function seedOrganization(
  organizationId: OrganizationId,
  slug: string
): Promise<Seeded> {
  return owner.begin(async (tx) => {
    const [{ id: caseId }] = await tx<{ id: CaseId }[]>`
      insert into cases (name, slug, organization_id)
      values (${slug}, ${slug}, ${organizationId}) returning id`;
    const [{ id: entityId }] = await tx<{ id: string }[]>`
      insert into entities (case_id, kind, name, slug)
      values (${caseId}, 'person', ${slug}, ${slug}) returning id`;
    const [{ id: otherEntityId }] = await tx<{ id: string }[]>`
      insert into entities (case_id, kind, name, slug)
      values (${caseId}, 'org', ${`${slug}-org`}, ${`${slug}-org`}) returning id`;
    const [{ id: claimId }] = await tx<{ id: string }[]>`
      insert into claims (entity_id, case_id, text, confidence)
      values (${entityId}, ${caseId}, 'a claim', 'unverified') returning id`;
    const [{ id: identifierId }] = await tx<{ id: string }[]>`
      insert into identifiers (entity_id, case_id, type, value, confidence)
      values (${entityId}, ${caseId}, 'email', ${`${slug}@example.invalid`}, 'unverified')
      returning id`;
    const [{ id: edgeId }] = await tx<{ id: string }[]>`
      insert into edges (from_id, to_id, case_id, predicate, confidence)
      values (${entityId}, ${otherEntityId}, ${caseId}, 'member_of', 'unverified') returning id`;
    await tx`insert into events (entity_id, case_id, "when", what)
      values (${entityId}, ${caseId}, '2026', 'an event')`;
    await tx`insert into questions (entity_id, case_id, text)
      values (${entityId}, ${caseId}, 'a question')`;
    await tx`insert into tasks (case_id, title) values (${caseId}, 'a task')`;
    const [{ id: evidenceId }] = await tx<{ id: string }[]>`
      insert into evidence (case_id, kind, actor_id) values (${caseId}, 'other', 'seed')
      returning id`;
    await tx`insert into claim_evidence (claim_id, evidence_id, case_id)
      values (${claimId}, ${evidenceId}, ${caseId})`;
    await tx`insert into identifier_evidence (identifier_id, evidence_id, case_id)
      values (${identifierId}, ${evidenceId}, ${caseId})`;
    await tx`insert into edge_evidence (edge_id, evidence_id, case_id)
      values (${edgeId}, ${evidenceId}, ${caseId})`;
    const [{ id: runId }] = await tx<{ id: string }[]>`
      insert into playbook_runs (case_id, playbook_id, seed, actor_id)
      values (${caseId}, 'seed-playbook', '{}'::jsonb, 'seed') returning id`;
    const [{ id: jobId }] = await tx<{ id: string }[]>`
      insert into jobs (case_id, capability_id, input, actor_id, playbook_run_id, playbook_step)
      values (${caseId}, 'seed.cap', '{}'::jsonb, 'seed', ${runId}, 0) returning id`;
    await tx`insert into job_evidence (job_id, evidence_id, case_id, position)
      values (${jobId}, ${evidenceId}, ${caseId}, 0)`;
    const [{ id: proposalId }] = await tx<{ id: string }[]>`
      insert into proposals (case_id, patch) values (${caseId}, '[]'::jsonb) returning id`;
    await tx`insert into proposal_evidence (proposal_id, evidence_id, case_id, position)
      values (${proposalId}, ${evidenceId}, ${caseId}, 0)`;
    const [{ id: callId }] = await tx<{ id: string }[]>`
      insert into provider_calls (id, case_id, job_id, run_id, seq, transport, method,
        url_redacted, body_kind, request_body_state, started_at)
      values (gen_random_uuid(), ${caseId}, ${jobId}, gen_random_uuid(), 0, 'http', 'GET',
        'https://example.invalid/', 'response', 'none', now())
      returning id`;
    await tx`insert into provider_call_outcomes (call_id, case_id, outcome, hops,
        response_headers, started_at, body_state, ended_at)
      values (${callId}, ${caseId}, 'failed', '[]'::jsonb, '{}'::jsonb, now(), 'none', now())`;
    await tx`insert into evidence_provider_calls (evidence_id, call_id, case_id)
      values (${evidenceId}, ${callId}, ${caseId})`;
    await tx`insert into cap_cache (case_id, capability_id, input_hash, cap_version,
        artifacts, ttl_ms, expires_at)
      values (${caseId}, 'seed.cap', 'h', '1', '[]'::jsonb, 1000, now())`;
    await tx`insert into evidence_uploads (case_id, uri, declared_sha256, declared_mime,
        declared_byte_length, actor_id)
      values (${caseId}, ${`${caseId}/x/seed.txt`}, 'x', 'text/plain', 1, 'seed')`;
    await tx`insert into finding_suppressions (case_id, fingerprint)
      values (${caseId}, 'seed')`;
    await tx`insert into case_deletion_records (case_id, organization_id, case_name,
        case_slug, event)
      values (${caseId}, ${organizationId}, ${slug}, ${slug}, 'restored')`;
    await tx`insert into activity (case_id, organization_id, kind, action)
      values (${caseId}, ${organizationId}, 'task', 'created')`;
    return { caseId, jobId };
  });
}

let seededA: Seeded;
let seededB: Seeded;

beforeAll(async () => {
  await resetTestDb();
  seededA = await seedOrganization(ORG_A, "rls-a");
  seededB = await seedOrganization(ORG_B, "rls-b");
});

afterAll(async () => {
  await resetTestDb();
  await owner.end({ timeout: 5 });
});

async function caseIdsIn(
  exec: Pick<typeof db, "execute">,
  table: string
): Promise<string[]> {
  const column = table === "cases" ? "id" : "case_id";
  const rows = await exec.execute<{ case_id: string }>(
    sql`select distinct ${sql.identifier(column)}::text as case_id from ${sql.identifier(table)}`
  );
  return rows.map((row) => row.case_id);
}

describe("organization isolation on every Case-scoped table (row-level security)", () => {
  it("every public table with a Case id has row-level security and a policy", async () => {
    const rows = await owner<
      { table: string; rls: boolean; policies: number }[]
    >`
      select c.relname as table, c.relrowsecurity as rls,
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
       where c.relkind = 'r'
         and (c.relname = 'cases' or exists (
           select 1 from pg_attribute a
            where a.attrelid = c.oid and a.attname = 'case_id' and not a.attisdropped))
       order by c.relname`;
    const unprotected = rows.filter((row) => !row.rls || row.policies === 0);
    expect(unprotected).toEqual([]);
    const readable = rows
      .map((row) => row.table)
      .filter(
        (table) =>
          table !== "collect_queue_stale" && table !== "collect_queue_case"
      );
    expect([...readable].sort()).toEqual([...PROTECTED_TABLES].sort());
  });

  it("the owner seeded a row of every table for both organizations", async () => {
    for (const table of PROTECTED_TABLES) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one table at a time, named on failure
      const rows = await owner.unsafe<{ case_id: string }[]>(
        `select distinct ${table === "cases" ? "id" : "case_id"}::text as case_id from "${table}"`
      );
      expect(rows.map((row) => row.case_id).sort(), table).toEqual(
        [seededA.caseId, seededB.caseId].sort()
      );
    }
  });

  it("a transaction with no organization reads no row of any of them", async () => {
    await db.transaction(async (tx) => {
      for (const table of PROTECTED_TABLES) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one table at a time, named on failure
        expect(await caseIdsIn(tx, table), table).toEqual([]);
      }
    });
    // Nor does a statement outside a transaction.
    for (const table of PROTECTED_TABLES) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- see above
      expect(await caseIdsIn(db, table), table).toEqual([]);
    }
  });

  it("an organization's scope reads its own rows of every table and no other's", async () => {
    for (const [organizationId, seeded] of [
      [ORG_A, seededA],
      [ORG_B, seededB],
    ] as const) {
      const scoped = organizationScopedDb(db, organizationId);
      for (const table of PROTECTED_TABLES) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one table at a time, named on failure
        expect(await caseIdsIn(scoped, table), table).toEqual([seeded.caseId]);
      }
    }
  });

  it("copies a child row's organization from its Case, whatever the insert sent", async () => {
    const stored = await db.transaction(async (tx) => {
      await setOrganizationContext(tx, ORG_A);
      await tx.execute(
        sql`select set_config('watchdog.channel', 'system', true)`
      );
      return tx.execute<{ organization_id: string }>(sql`
        insert into tasks (case_id, title, organization_id)
        values (${seededA.caseId}, 'forged organization', ${ORG_B})
        returning organization_id`);
    });
    expect(stored.map((row) => row.organization_id)).toEqual([ORG_A]);
  });

  it("refuses to write a row of another organization's Case, either policy shape", async () => {
    // A table with its own copy of the organization.
    await expectPostgresRefusal(
      db.transaction(async (tx) => {
        await setOrganizationContext(tx, ORG_A);
        await tx.execute(
          sql`select set_config('watchdog.channel', 'system', true)`
        );
        await tx.execute(
          sql`insert into tasks (case_id, title) values (${seededB.caseId}, 'smuggled')`
        );
      }),
      { code: "42501" }
    );
    // A table that reaches its organization through the Case.
    await expectPostgresRefusal(
      db.transaction(async (tx) => {
        await setOrganizationContext(tx, ORG_A);
        await tx.execute(
          sql`insert into finding_suppressions (case_id, fingerprint) values (${seededB.caseId}, 'smuggled')`
        );
      }),
      { code: "42501" }
    );
  });

  it("an update or delete of another organization's rows touches none", async () => {
    const touched = await db.transaction(async (tx) => {
      await setOrganizationContext(tx, ORG_A);
      await tx.execute(
        sql`select set_config('watchdog.channel', 'system', true)`
      );
      const tasks = await tx.execute(
        sql`update tasks set title = 'changed' where case_id = ${seededB.caseId} returning id`
      );
      const uploads = await tx.execute(
        sql`delete from evidence_uploads where case_id = ${seededB.caseId} returning id`
      );
      return tasks.length + uploads.length;
    });
    expect(touched).toBe(0);
  });

  it("answers a Job's organization past the policies, for the worker", async () => {
    expect(await jobOrganizationIdUnchecked(db, seededB.jobId)).toBe(ORG_B);
    expect(
      await jobOrganizationIdUnchecked(
        db,
        "00000000-0000-4000-8000-000000000000"
      )
    ).toBeNull();
    expect(await jobOrganizationIdUnchecked(db, "not-a-uuid")).toBeNull();
  });

  it("the process-wide activity reads see every organization's entries", async () => {
    // The commit-safe drain depends on every open transaction of the cluster, so the proof reads
    // the positions that do not: the newest entry of the whole log, and whether any lies past one.
    const [ownerNewest] = await owner<{ xid: string; id: string }[]>`
      select xid::text as xid, id::text as id from activity order by xid desc, id desc limit 1`;
    const newest = await activityLogRepo.newest(db);
    expect(newest).toEqual({
      xid: ownerNewest?.xid,
      id: Number(ownerNewest?.id),
    });
    // Organization A's scope sees an older newest entry: B's is the log's last.
    const [scopedNewest] = await organizationScopedDb(db, ORG_A).execute<{
      case_id: string;
    }>(
      sql`select case_id::text from activity order by xid desc, id desc limit 1`
    );
    expect(scopedNewest?.case_id).toBe(seededA.caseId);
    expect(await activityLogRepo.hasPast(db, { xid: "0", id: 0 })).toBe(true);
  });
});
