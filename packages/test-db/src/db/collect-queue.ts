import { sql } from "drizzle-orm";

import type { DbExec } from "@watchdog/db";
import type {
  CaseId,
  JsonObject,
  JsonValue,
  CollectRowKind,
  CollectRowState,
  JobStatus,
} from "@watchdog/schemas/shared";
import type {
  CollectQueueRowFact,
  CollectSource,
} from "@watchdog/schemas/testing";

import { owner } from "./with-test-tx";

/**
 * Run Collect's queue flush now, on `exec`'s session. The projection is written by a deferred
 * trigger at COMMIT, so a test whose transaction rolls back (`withTestTx`) would never see it:
 * the `seed*` helpers call this at their end. A no-op when the session recorded no key.
 */
export async function flushCollectQueue(exec: DbExec): Promise<void> {
  await exec.execute(sql`select public.collect_queue_flush()`);
}

/** A timestamp column as microseconds since the epoch (a `Date` would drop them). */
function micros(column: string) {
  return sql.raw(`floor(extract(epoch from ${column}) * 1000000)::bigint`);
}

type QueueRow = {
  id: string;
  kind: CollectRowKind;
  sort_at: string;
  activity_at: string;
  state: CollectRowState;
  entity_id: string | null;
  capability_ids: string[];
  search_text: string;
  members: string[];
};

/** A Case's stored queue rows with their members, sorted by id (the reference's shape). */
export async function readCollectQueue(
  exec: DbExec,
  caseId: CaseId
): Promise<CollectQueueRowFact[]> {
  const rows = await exec.execute<QueueRow>(sql`
    select q.id, q.kind, ${micros("q.sort_at")} as sort_at, ${micros("q.activity_at")} as activity_at,
           q.state, q.entity_id, q.capability_ids, q.search_text,
           coalesce(array(select m.job_id::text from public.collect_queue_member m
                           where m.row_id = q.id order by m.job_id::text collate "C"), '{}') as members
      from public.collect_queue q
     where q.case_id = ${caseId}
     order by q.id::text collate "C"`);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    sortAt: Number(row.sort_at),
    activityAt: Number(row.activity_at),
    state: row.state,
    entityId: row.entity_id,
    capabilityIds: row.capability_ids,
    searchText: row.search_text,
    members: row.members,
  }));
}

/** Member pairs of a Case whose row is gone, or rows of a Case stored under no Case: none expected. */
export async function countOrphanCollectMembers(
  exec: DbExec,
  caseId: CaseId
): Promise<number> {
  const rows = await exec.execute<{ n: number }>(sql`
    select count(*)::int as n from public.collect_queue_member m
     where m.case_id = ${caseId}
       and not exists (select 1 from public.collect_queue q where q.id = m.row_id)`);
  return rows[0]?.n ?? 0;
}

export type CollectQueueDiff = {
  readonly kind: "row" | "member";
  readonly id: string;
  readonly detail: string;
};

/** Where the stored projection of a live Case differs from a full recomputation (empty: none). */
export async function collectQueueDiff(
  exec: DbExec,
  caseId: CaseId
): Promise<CollectQueueDiff[]> {
  const rows = await exec.execute<{
    diff_kind: "row" | "member";
    diff_id: string;
    diff_detail: string;
  }>(sql`select * from public.collect_queue_diff(${caseId})`);
  return rows.map((row) => ({
    kind: row.diff_kind,
    id: row.diff_id,
    detail: row.diff_detail,
  }));
}

/**
 * Cases logged as stale by a failed flush, read as the owner (the application role has no
 * privilege on the projection's bookkeeping). Committed rows only.
 */
export async function listCollectQueueStale(): Promise<
  { caseId: string; error: string | null }[]
> {
  const rows = await owner().unsafe<
    { case_id: string; error: string | null }[]
  >("select case_id::text, error from public.collect_queue_stale order by id");
  return rows.map((row) => ({ caseId: row.case_id, error: row.error }));
}

function time(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/** A Case's source rows, as the reference (`collectQueueReference`) reads them. */
export async function readCollectSource(
  exec: DbExec,
  caseId: CaseId
): Promise<CollectSource> {
  const evidence = await exec.execute<{
    id: string;
    captured_at: string;
    processed_at: string | null;
    deleted_at: string | null;
    entity_id: string | null;
    label: string | null;
    notes: string | null;
    source_url: string | null;
  }>(sql`
    select e.id, ${micros("e.captured_at")} as captured_at, ${micros("e.processed_at")} as processed_at,
           ${micros("e.deleted_at")} as deleted_at, e.entity_id, e.label, e.notes, e.source_url
      from public.evidence e where e.case_id = ${caseId} order by e.id`);
  const jobs = await exec.execute<{
    id: string;
    capability_id: string;
    status: JobStatus;
    input: JsonObject;
    playbook_run_id: string | null;
    retry_of_job_id: string | null;
    evidence_ids: string[];
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    result_summary: string | null;
    error: string | null;
    interpret_error: string | null;
  }>(sql`
    select j.id, j.capability_id, j.status, j.input, j.playbook_run_id, j.retry_of_job_id,
           coalesce(array(select je.evidence_id::text from public.job_evidence je
                           where je.job_id = j.id order by je.position), '{}') as evidence_ids,
           ${micros("j.created_at")} as created_at, ${micros("j.started_at")} as started_at,
           ${micros("j.finished_at")} as finished_at, j.result_summary, j.error, j.interpret_error
      from public.jobs j where j.case_id = ${caseId} order by j.id`);
  const runs = await exec.execute<{
    id: string;
    playbook_id: string;
    created_at: string;
  }>(sql`
    select r.id, r.playbook_id, ${micros("r.created_at")} as created_at
      from public.playbook_runs r where r.case_id = ${caseId} order by r.id`);
  return {
    evidence: evidence.map((row) => ({
      id: row.id,
      capturedAt: Number(row.captured_at),
      processedAt: time(row.processed_at),
      deletedAt: time(row.deleted_at),
      entityId: row.entity_id,
      label: row.label,
      notes: row.notes,
      sourceUrl: row.source_url,
    })),
    jobs: jobs.map((row) => ({
      id: row.id,
      capabilityId: row.capability_id,
      status: row.status,
      input: row.input,
      playbookRunId: row.playbook_run_id,
      retryOfJobId: row.retry_of_job_id,
      evidenceIds: row.evidence_ids,
      createdAt: Number(row.created_at),
      startedAt: time(row.started_at),
      finishedAt: time(row.finished_at),
      resultSummary: row.result_summary,
      error: row.error,
      interpretError: row.interpret_error,
    })),
    runs: runs.map((row) => ({
      id: row.id,
      playbookId: row.playbook_id,
      createdAt: Number(row.created_at),
    })),
  };
}

/**
 * `collect_input_evidence_id(input, 'evidenceId')` for each value, as `{ evidenceId: value }`, in
 * one statement: the projection's id parse, for drift tests against `parseTrimmedUuid`.
 */
export async function parseCollectInputIds(
  exec: DbExec,
  values: readonly JsonValue[]
): Promise<(string | null)[]> {
  const rows = await exec.execute<{ id: string | null }>(sql`
    select public.collect_input_evidence_id(jsonb_build_object('evidenceId', v.value), 'evidenceId')::text as id
      from jsonb_array_elements(${JSON.stringify(values)}::jsonb) with ordinality as v(value, n)
     order by v.n`);
  return rows.map((row) => row.id);
}

/** `collect_input_linked_cap(id)` for each Cap id: whether the projection links it by input. */
export async function collectLinkedCaps(
  exec: DbExec,
  capabilityIds: readonly string[]
): Promise<boolean[]> {
  const rows = await exec.execute<{ linked: boolean }>(sql`
    select public.collect_input_linked_cap(c.id) as linked
      from jsonb_array_elements_text(${JSON.stringify(capabilityIds)}::jsonb) with ordinality as c(id, n)
     order by c.n`);
  return rows.map((row) => row.linked);
}

/**
 * Run `fn` while every Collect queue flush fails: the owner swaps `collect_queue_sync` for one
 * that raises (a test-only fault on the private database), then puts the original back. Tests of
 * the failure policy use it: the writer must still commit, and the Case be logged as stale.
 */
export async function withCollectQueueFault<T>(
  fn: () => Promise<T>
): Promise<T> {
  const sqlOwner = owner();
  const [original] = await sqlOwner.unsafe<{ def: string }[]>(
    "select pg_get_functiondef('public.collect_queue_sync'::regproc) as def"
  );
  if (original === undefined) throw new Error("collect_queue_sync is missing");
  await sqlOwner.unsafe(`
    CREATE OR REPLACE FUNCTION public.collect_queue_sync(p_case uuid, p_jobs uuid[], p_evidence uuid[], p_rebuild boolean)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
    BEGIN RAISE EXCEPTION 'collect_queue test fault'; END $$`);
  try {
    return await fn();
  } finally {
    await sqlOwner.unsafe(original.def);
  }
}

/** Empty the failed-flush log (as the owner), so only the drift check's counts can find a Case. */
export async function clearCollectQueueStale(): Promise<void> {
  await owner().unsafe("delete from public.collect_queue_stale");
}
