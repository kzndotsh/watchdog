import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { CaseId, JobStatus, JsonObject } from "@watchdog/schemas/shared";
import { collectQueueReference } from "@watchdog/schemas/testing";
import {
  collectQueueDiff,
  listCollectQueueStale,
  readCollectQueue,
  readCollectSource,
  resetTestDb,
  seedCase,
  seedEntity,
  testDb,
} from "@watchdog/test-db";
import { fc } from "@watchdog/test-kit/fc";

import type { DbExec } from "../exec";

/*
 * The stateful model of Collect's queue projection (#574). Random sequences of the writes that
 * move the queue (create, settle and retry Jobs, land and link Evidence, capture, hide, restore,
 * relabel and attach Evidence, delete Jobs and runs, several of them in one transaction), each
 * COMMITTED on the private database so the deferred flush runs as in production. After every
 * command the stored projection must equal the TypeScript reference over the source rows (the
 * rules), and `collect_queue_diff` must be empty (the incremental update equals a full rebuild).
 */

type Model = { evidence: string[]; jobs: string[]; runs: string[] };
type Real = { caseId: CaseId; entityId: string };

const CAPS = [
  "network.dns.lookup",
  "evidence.harvest",
  "evidence.extract.ai",
  "network.url.enrich",
] as const;
const FORMS = ["none", "valid", "padded", "upper", "junk", "source"] as const;
type InputForm = (typeof FORMS)[number];
const STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

/** U+2003, which JavaScript's `trim` removes. */
const EM_SPACE = String.fromCodePoint(0x20_03);

function pick<T>(list: readonly T[], n: number): T | undefined {
  return list.length === 0 ? undefined : list[n % list.length];
}

/** Each input form, naming an Evidence id the way the builder parses it (or fails to). */
const INPUT_FORMS: Record<InputForm, (id: string) => JsonObject> = {
  none: () => ({ host: "model.example" }),
  valid: (id) => ({ evidenceId: id, host: "model.example" }),
  padded: (id) => ({ evidenceId: `${EM_SPACE}${id}\n` }),
  upper: (id) => ({ evidenceId: id.toUpperCase() }),
  junk: (id) => ({ evidenceId: `${id.slice(0, 35)}g` }),
  source: (id) => ({ sourceEvidenceId: id, url: "https://model.example/" }),
};

function inputFor(form: InputForm, evidenceId: string | undefined): JsonObject {
  return INPUT_FORMS[form](evidenceId ?? randomUUID());
}

async function settle(exec: DbExec, jobId: string, status: JobStatus) {
  await exec.execute(sql`
    update public.jobs set
      status = ${status},
      started_at = case when ${status} = 'queued' then started_at else coalesce(started_at, now()) end,
      finished_at = case when ${status} in ('succeeded', 'failed', 'cancelled') then now() end,
      result_summary = case when ${status} = 'succeeded' then 'model result ' || ${status} end,
      error = case when ${status} = 'failed' then 'model failure' end
    where id = ${jobId}`);
}

async function insertJob(
  exec: DbExec,
  real: Real,
  job: {
    id: string;
    cap: string;
    status: JobStatus;
    input: JsonObject;
    runId: string | null;
    retryOf: string | null;
  }
) {
  await exec.execute(sql`
    insert into public.jobs (id, case_id, capability_id, input, status, actor_id, playbook_run_id,
                             playbook_step, retry_of_job_id, started_at, finished_at)
    values (${job.id}, ${real.caseId}, ${job.cap}, ${JSON.stringify(job.input)}::jsonb, ${job.status},
            'model', ${job.runId},
            case when ${job.runId}::uuid is not null
                 then (select count(*)::int from public.jobs where playbook_run_id = ${job.runId}) end,
            ${job.retryOf},
            case when ${job.status} <> 'queued' then now() end,
            case when ${job.status} in ('succeeded', 'failed', 'cancelled') then now() end)`);
}

async function land(
  exec: DbExec,
  real: Real,
  jobId: string,
  evidenceIds: string[]
) {
  for (const evidenceId of evidenceIds) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- landing order is the position order
    await exec.execute(sql`
      insert into public.job_evidence (job_id, evidence_id, case_id, position)
      select ${jobId}, ${evidenceId}, ${real.caseId},
             coalesce((select max(position) + 1 from public.job_evidence where job_id = ${jobId}), 0)
      on conflict do nothing`);
  }
}

type Op =
  | { t: "capture"; label: string }
  | { t: "createRun" }
  | {
      t: "createJob";
      cap: string;
      run: number;
      form: InputForm;
      ev: number;
      status: JobStatus;
    }
  | { t: "settle"; job: number; status: JobStatus }
  | { t: "retry"; job: number; join: boolean }
  | { t: "land"; job: number; ev: number; two: boolean }
  | { t: "linkInput"; job: number; ev: number; form: InputForm }
  | { t: "hide"; ev: number }
  | { t: "restore"; ev: number }
  | { t: "deleteJob"; job: number }
  | { t: "deleteRun"; run: number }
  | { t: "attachEntity"; ev: number; on: boolean }
  | { t: "relabel"; ev: number; label: string }
  | { t: "batch"; job: number; ev: number; status: JobStatus };

async function apply(op: Op, m: Model, real: Real): Promise<void> {
  const ev = "ev" in op ? pick(m.evidence, op.ev) : undefined;
  const job = "job" in op ? pick(m.jobs, op.job) : undefined;
  switch (op.t) {
    case "capture": {
      const id = randomUUID();
      await testDb.execute(sql`
        insert into public.evidence (id, case_id, kind, label, text, actor_id)
        values (${id}, ${real.caseId}, 'attestation', ${op.label}, 'body', 'model')`);
      m.evidence.push(id);
      return;
    }
    case "createRun": {
      const id = randomUUID();
      await testDb.execute(sql`
        insert into public.playbook_runs (id, case_id, playbook_id, seed, actor_id)
        values (${id}, ${real.caseId}, ${`model-playbook-${m.runs.length % 2}`}, '{}', 'model')`);
      m.runs.push(id);
      return;
    }
    case "createJob": {
      const id = randomUUID();
      await insertJob(testDb, real, {
        id,
        cap: op.cap,
        status: op.status,
        input: inputFor(op.form, pick(m.evidence, op.ev)),
        runId: op.run < 0 ? null : (pick(m.runs, op.run) ?? null),
        retryOf: null,
      });
      m.jobs.push(id);
      return;
    }
    case "settle": {
      if (job !== undefined) await settle(testDb, job, op.status);
      return;
    }
    case "retry": {
      if (job === undefined) return;
      const [original] = await testDb.execute<{
        capability_id: string;
        input: JsonObject;
        playbook_run_id: string | null;
      }>(
        sql`select capability_id, input, playbook_run_id from public.jobs where id = ${job}`
      );
      if (original === undefined) return;
      const id = randomUUID();
      await insertJob(testDb, real, {
        id,
        cap: original.capability_id,
        status: "queued",
        input: original.input,
        runId: op.join ? original.playbook_run_id : null,
        retryOf: job,
      });
      m.jobs.push(id);
      return;
    }
    case "land": {
      if (job === undefined || ev === undefined) return;
      await land(
        testDb,
        real,
        job,
        op.two ? [ev, pick(m.evidence, op.ev + 1) ?? ev] : [ev]
      );
      return;
    }
    case "linkInput": {
      if (job === undefined) return;
      await testDb.execute(sql`
        update public.jobs set input = ${JSON.stringify(inputFor(op.form, ev))}::jsonb where id = ${job}`);
      return;
    }
    case "hide": {
      if (ev !== undefined)
        await testDb.execute(
          sql`update public.evidence set deleted_at = now() where id = ${ev}`
        );
      return;
    }
    case "restore": {
      if (ev !== undefined)
        await testDb.execute(
          sql`update public.evidence set deleted_at = null where id = ${ev}`
        );
      return;
    }
    case "deleteJob": {
      if (job === undefined) return;
      await testDb.execute(sql`delete from public.jobs where id = ${job}`);
      m.jobs = m.jobs.filter((id) => id !== job);
      return;
    }
    case "deleteRun": {
      const run = pick(m.runs, op.run);
      if (run === undefined) return;
      await testDb.execute(
        sql`delete from public.playbook_runs where id = ${run}`
      );
      m.runs = m.runs.filter((id) => id !== run);
      return;
    }
    case "attachEntity": {
      if (ev !== undefined)
        await testDb.execute(sql`
          update public.evidence set entity_id = ${op.on ? real.entityId : null} where id = ${ev}`);
      return;
    }
    case "relabel": {
      if (ev !== undefined)
        await testDb.execute(sql`
          update public.evidence set label = ${op.label}, processed_at = now() where id = ${ev}`);
      return;
    }
    case "batch": {
      // One transaction, several keys: a settle, a hide toggle, and a new Job linked by input.
      await testDb.transaction(async (tx) => {
        if (job !== undefined) await settle(tx, job, op.status);
        if (ev !== undefined)
          await tx.execute(sql`
            update public.evidence set deleted_at = case when deleted_at is null then now() end
            where id = ${ev}`);
        const id = randomUUID();
        await insertJob(tx, real, {
          id,
          cap: "evidence.harvest",
          status: "queued",
          input: inputFor("valid", ev),
          runId: null,
          retryOf: null,
        });
        m.jobs.push(id);
      });
      return;
    }
    default: {
      throw new Error("unknown op");
    }
  }
}

async function expectProjectionHolds(real: Real): Promise<void> {
  const source = await readCollectSource(testDb, real.caseId);
  expect(await readCollectQueue(testDb, real.caseId)).toEqual(
    collectQueueReference(source)
  );
  expect(await collectQueueDiff(testDb, real.caseId)).toEqual([]);
}

class Command implements fc.AsyncCommand<Model, Real> {
  readonly op: Op;
  constructor(op: Op) {
    this.op = op;
  }
  check(): boolean {
    return true;
  }
  async run(m: Model, real: Real): Promise<void> {
    await apply(this.op, m, real);
    await expectProjectionHolds(real);
  }
  toString(): string {
    return JSON.stringify(this.op);
  }
}

// Small indices, so commands keep hitting the same few rows (an index wraps over the live ones).
const idx = fc.nat({ max: 3 });
const status = fc.constantFrom(...STATUSES);
// Mostly ids that link, so hides and restores keep moving Jobs between rows.
const form = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom("valid", "padded", "source") },
  { weight: 1, arbitrary: fc.constantFrom(...FORMS) }
);
const label = fc.string({ maxLength: 12 }).filter((s) => !s.includes("\u0000"));

const commands = fc.commands(
  [
    label.map((l) => new Command({ t: "capture", label: l })),
    fc.constant(new Command({ t: "createRun" })),
    fc
      .record({
        cap: fc.constantFrom(...CAPS),
        run: fc.integer({ min: -2, max: 4 }),
        form,
        ev: idx,
        status,
      })
      .map((r) => new Command({ t: "createJob", ...r })),
    fc
      .record({ job: idx, status })
      .map((r) => new Command({ t: "settle", ...r })),
    fc
      .record({ job: idx, join: fc.boolean() })
      .map((r) => new Command({ t: "retry", ...r })),
    fc
      .record({ job: idx, ev: idx, two: fc.boolean() })
      .map((r) => new Command({ t: "land", ...r })),
    fc
      .record({ job: idx, ev: idx, form })
      .map((r) => new Command({ t: "linkInput", ...r })),
    idx.map((ev) => new Command({ t: "hide", ev })),
    idx.map((ev) => new Command({ t: "restore", ev })),
    idx.map((job) => new Command({ t: "deleteJob", job })),
    idx.map((run) => new Command({ t: "deleteRun", run })),
    fc
      .record({ ev: idx, on: fc.boolean() })
      .map((r) => new Command({ t: "attachEntity", ...r })),
    fc
      .record({ ev: idx, label })
      .map((r) => new Command({ t: "relabel", ...r })),
    fc
      .record({ job: idx, ev: idx, status })
      .map((r) => new Command({ t: "batch", ...r })),
  ],
  { maxCommands: 40, size: "large" }
);

describe("Collect queue projection: stateful model", () => {
  it("matches the reference and a full rebuild after every committed command", async () => {
    let sequences = 0;
    let steps = 0;
    await fc.assert(
      fc.asyncProperty(commands, async (cmds) => {
        await resetTestDb();
        const c = await seedCase(testDb);
        const entity = await seedEntity(testDb, c.id);
        const real: Real = { caseId: c.id, entityId: entity.id };
        const model: Model = { evidence: [], jobs: [], runs: [] };
        await fc.asyncModelRun(() => ({ model, real }), cmds);
        expect(await listCollectQueueStale()).toEqual([]);
        sequences += 1;
        steps += [...cmds].length;
      }),
      { numRuns: 100, seed: 574 }
    );
    expect(sequences).toBeGreaterThan(0);
    expect(steps).toBeGreaterThan(0);
  }, 300_000);
});
