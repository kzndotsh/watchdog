import { describe, expect, it } from "vitest";

import { client } from "@watchdog/db";
import { explainPlan, expectNoSeqScan } from "@watchdog/test-db";

/**
 * Every foreign key is checked by Postgres on each delete of the parent row (and on update of
 * its key): `select ... from child where fk = $1`. Without an index whose leading column is the
 * FK that is a scan of the child table per parent row, so a Case delete grows with the whole
 * table, not the Case (performance spec #250, findings B3 and B32).
 */

/** Single-column FKs with no complete (non-partial) index leading with the column. */
async function unindexedForeignKeys(): Promise<string[]> {
  const rows = await client<{ fk: string }[]>`
    select c.conrelid::regclass::text || '.' || a.attname as fk
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f'
      and array_length(c.conkey, 1) = 1
      and n.nspname in ('public', 'auth')
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1] and i.indpred is null
      )
    order by 1`;
  return rows.map((row) => row.fk);
}

/**
 * Deliberately not indexed, each with its reason:
 * - `jobs.playbook_run_id`: `jobs_playbook_run_step_fan_uq` leads with it and is partial on
 *   `playbook_run_id IS NOT NULL`, which an equality lookup implies, so the planner uses it.
 * - `auth.invitation.inviter_id`: a few rows per organization, read only when a user is deleted.
 */
const COVERED_OR_ACCEPTED = new Set([
  "jobs.playbook_run_id",
  "auth.invitation.inviter_id",
]);

/** The reverse lookups behind the cascade and set-null deletes the audit measured. */
const REVERSE_LOOKUPS = [
  ["edges", "to_id"],
  ["events", "entity_id"],
  ["questions", "entity_id"],
  ["evidence", "entity_id"],
  ["proposals", "job_id"],
  ["playbook_runs", "case_id"],
  ["graph_writes", "case_id"],
  ["finding_suppressions", "proposal_id"],
  ["claim_evidence", "evidence_id"],
  ["identifier_evidence", "evidence_id"],
  ["edge_evidence", "evidence_id"],
  ["jobs", "playbook_run_id"],
] as const;

describe("foreign key indexes", () => {
  it("leaves no foreign key without an index to find its child rows", async () => {
    const missing = (await unindexedForeignKeys()).filter(
      (fk) => !COVERED_OR_ACCEPTED.has(fk)
    );
    expect(missing).toEqual([]);
  });

  it("does not keep an index that is a strict prefix of another (tasks.case_id)", async () => {
    const rows = await client<{ indexname: string }[]>`
      select indexname from pg_indexes
      where schemaname = 'public' and tablename = 'tasks' and indexname = 'tasks_case_id_idx'`;
    expect(rows).toEqual([]);
  });

  it.each(REVERSE_LOOKUPS)(
    "serves %s by %s through an index, not a table scan",
    async (table, column) => {
      const plan = await explainPlan({
        sql: `select 1 from ${table} where ${column} = $1`,
        params: ["00000000-0000-4000-8000-000000000000"],
      });
      expectNoSeqScan(plan, table);
      // With sequential scans off a table can still be read by walking a whole index (edges
      // and the evidence link tables do, through a key that leads with another column; Postgres
      // 18 may skip-scan it), so also require an index that LEADS with the FK column.
      const names = [
        ...JSON.stringify(plan).matchAll(/"Index Name":"([^"]+)"/g),
      ].map((match) => match[1] ?? "");
      const leading = await client<{ attname: string }[]>`
        select a.attname
        from pg_class i
        join pg_index x on x.indexrelid = i.oid
        join pg_attribute a on a.attrelid = x.indrelid and a.attnum = x.indkey[0]
        where i.relname in ${client(names)}`;
      expect(leading.map((row) => row.attname)).toContain(column);
    }
  );
});
