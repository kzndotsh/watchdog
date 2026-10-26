import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CaseId } from "@watchdog/schemas/shared";
import { collectQueueReference } from "@watchdog/schemas/testing";
import {
  collectQueueDiff,
  listCollectQueueStale,
  readCollectQueue,
  readCollectSource,
  resetTestDb,
  seedCase,
  testDb,
} from "@watchdog/test-db";

/*
 * Collect's queue projection (#574) under real concurrency: separate connections, real COMMITs,
 * so the deferred flush and its Case lock run as in production. Every scenario asserts that no
 * transaction failed (in particular no 40P01 deadlock), that no flush was logged as stale, and
 * that the projection equals the reference and a full rebuild afterwards.
 */

const LOCK_CLASS = 1_464_091_473;
const opened: postgres.Sql[] = [];

/** One connection, as the application role (or the owner, for a purge). */
function connect(as: "app" | "owner" = "app"): postgres.Sql {
  const url =
    as === "owner"
      ? (process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL)
      : process.env.DATABASE_URL;
  if (url === undefined) throw new Error("DATABASE_URL is required");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  opened.push(client);
  return client;
}

let shared: { app: postgres.Sql; owner: postgres.Sql } | undefined;

/** One setup connection and one owner connection per test, for inserts and lock polling. */
function setup() {
  shared ??= { app: connect(), owner: connect("owner") };
  return shared;
}

afterEach(async () => {
  shared = undefined;
  await Promise.all(
    opened.splice(0).map((client) => client.end({ timeout: 5 }))
  );
});

/**
 * A transaction left open on its own connection. postgres.js sends a query only once it is
 * awaited, so each statement is started at once (`execute`) and handed back as a promise.
 */
async function openTx(client: postgres.Sql) {
  await client.unsafe("begin");
  return {
    run: (query: string, params: postgres.ParameterOrJSON<never>[] = []) =>
      Promise.resolve(client.unsafe(query, params).execute()),
    commit: () => Promise.resolve(client.unsafe("commit").execute()),
  };
}

/** Settle a Job the way `settleJobInTx` does: lock the row, then write the status. */
async function settleIn(
  tx: Awaited<ReturnType<typeof openTx>>,
  jobId: string,
  status: "running" | "succeeded" | "failed"
) {
  await tx.run("select status from public.jobs where id = $1 for update", [
    jobId,
  ]);
  await tx.run(
    `update public.jobs set status = $2,
       started_at = coalesce(started_at, now()),
       finished_at = case when $2 in ('succeeded', 'failed') then now() end
     where id = $1`,
    [jobId, status]
  );
}

async function insertEvidence(caseId: CaseId): Promise<string> {
  const id = randomUUID();
  await setup().app.unsafe(
    `insert into public.evidence (id, case_id, kind, label, text, actor_id)
     values ($1, $2, 'attestation', 'shared', 'body', 'test')`,
    [id, caseId]
  );
  return id;
}

async function insertJob(
  caseId: CaseId,
  opts: {
    cap?: string;
    input?: object;
    runId?: string;
    step?: number;
    fan?: number;
    status?: string;
  } = {}
): Promise<string> {
  const id = randomUUID();
  await setup().app.unsafe(
    `insert into public.jobs (id, case_id, capability_id, input, status, actor_id,
                              playbook_run_id, playbook_step, playbook_fan_index, started_at)
     values ($1, $2, $3, $4::text::jsonb, $5, 'test', $6, $7, $8, now())`,
    [
      id,
      caseId,
      opts.cap ?? "network.dns.lookup",
      JSON.stringify(opts.input ?? { host: "race.example" }),
      opts.status ?? "running",
      opts.runId ?? null,
      opts.step ?? null,
      opts.fan ?? 0,
    ]
  );
  return id;
}

async function insertRun(caseId: CaseId): Promise<string> {
  const id = randomUUID();
  await setup().app.unsafe(
    `insert into public.playbook_runs (id, case_id, playbook_id, seed, actor_id)
     values ($1, $2, 'race-playbook', '{}', 'test')`,
    [id, caseId]
  );
  return id;
}

/** A third connection holds the Case's flush lock, so both writers reach COMMIT and wait there. */
async function holdCaseLock(caseId: CaseId) {
  const holder = connect();
  await holder.unsafe(
    "select pg_advisory_lock($1, public.collect_queue_lock_key($2::uuid))",
    [LOCK_CLASS, caseId]
  );
  return () =>
    holder.unsafe(
      "select pg_advisory_unlock($1, public.collect_queue_lock_key($2::uuid))",
      [LOCK_CLASS, caseId]
    );
}

/**
 * Backends waiting on a lock in a statement that contains `fragment`, read as the owner: the
 * application role cannot see another role's statement (the purger runs as the owner).
 */
async function lockWaiters(fragment: string): Promise<number> {
  const rows = await setup().owner.unsafe<{ n: number }[]>(
    `select count(*)::int as n from pg_stat_activity
      where wait_event_type = 'Lock' and datname = current_database()
        and lower(query) like '%' || $1 || '%'`,
    [fragment]
  );
  return rows[0]?.n ?? 0;
}

async function waitForWaiters(fragment: string, n: number) {
  await vi.waitFor(
    async () => {
      expect(await lockWaiters(fragment)).toBe(n);
    },
    { timeout: 5000, interval: 20 }
  );
}

async function waitForCommitsBlocked(n: number) {
  await waitForWaiters("commit", n);
}

function expectAllCommitted(results: PromiseSettledResult<unknown>[]) {
  const failures = results.flatMap((r) =>
    r.status === "rejected" ? [String(r.reason)] : []
  );
  expect(failures).toEqual([]);
}

async function expectProjectionHolds(caseId: CaseId) {
  expect(await listCollectQueueStale()).toEqual([]);
  expect(await collectQueueDiff(testDb, caseId)).toEqual([]);
  expect(await readCollectQueue(testDb, caseId)).toEqual(
    collectQueueReference(await readCollectSource(testDb, caseId))
  );
}

/** Settle process Job P (input E) in A while B hides E; both reach COMMIT under a held lock. */
async function settleAgainstHide(order: "settle-first" | "hide-first") {
  await resetTestDb();
  const c = await seedCase(testDb);
  const e = await insertEvidence(c.id);
  const p = await insertJob(c.id, {
    cap: "evidence.harvest",
    input: { evidenceId: e },
  });
  expect(
    (await readCollectQueue(testDb, c.id)).find((r) => r.id === e)?.members
  ).toEqual([p]);
  const release = await holdCaseLock(c.id);

  const a = await openTx(connect());
  const b = await openTx(connect());
  const settle = async () => {
    await settleIn(a, p, "succeeded");
    return a.commit();
  };
  const hide = async () => {
    await b.run("update public.evidence set deleted_at = now() where id = $1", [
      e,
    ]);
    return b.commit();
  };
  const first = order === "settle-first" ? settle() : hide();
  await waitForCommitsBlocked(1);
  const second = order === "settle-first" ? hide() : settle();
  await waitForCommitsBlocked(2);
  await release();
  const started = Date.now();
  const results = await Promise.allSettled([first, second]);
  expect(Date.now() - started).toBeLessThan(5000);
  expectAllCommitted(results);

  await expectProjectionHolds(c.id);
  // P's own row now: its Evidence is hidden, and it finished.
  const row = (await readCollectQueue(testDb, c.id)).find((r) => r.id === p);
  expect(row).toMatchObject({ kind: "job", state: "landed", members: [p] });
}

describe(
  "Collect queue projection under concurrency",
  { timeout: 30_000 },
  () => {
    it("a settle and a hide of its Evidence commit, settle first, with no deadlock", async () => {
      await settleAgainstHide("settle-first");
    });

    it("a settle and a hide of its Evidence commit, hide first, with no deadlock", async () => {
      await settleAgainstHide("hide-first");
    });

    it("a settle under casesRepo.lockById and a new Job commit together", async () => {
      await resetTestDb();
      const c = await seedCase(testDb);
      const e = await insertEvidence(c.id);
      const j = await insertJob(c.id);
      const k = await insertJob(c.id, { cap: "evidence.harvest" });
      const release = await holdCaseLock(c.id);
      const a = await openTx(connect());
      const b = await openTx(connect());
      // `lockById`: FOR UPDATE on the Case row, held to commit.
      await a.run(
        "select id from public.cases where id = $1 and deleted_at is null for update",
        [c.id]
      );
      await settleIn(a, j, "succeeded");
      const first = a.commit();
      await waitForCommitsBlocked(1);
      // B gives a Job a new row (it now links Evidence), so its flush inserts projection rows; with
      // a foreign key into cases that insert would wait on A's Case lock while A waits on B.
      await b.run(
        "update public.jobs set input = $2::text::jsonb where id = $1",
        [k, JSON.stringify({ evidenceId: e })]
      );
      const second = b.commit();
      await waitForCommitsBlocked(2);
      await release();
      expectAllCommitted(await Promise.allSettled([first, second]));
      await expectProjectionHolds(c.id);
      expect(
        (await readCollectQueue(testDb, c.id)).find((r) => r.id === e)?.members
      ).toEqual([k]);
    });

    it("two settles in one run, at once, leave the run row right", async () => {
      await resetTestDb();
      const c = await seedCase(testDb);
      const run = await insertRun(c.id);
      for (let round = 0; round < 10; round += 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- rounds are sequential on purpose
        const one = await insertJob(c.id, { runId: run, step: round, fan: 0 });
        // oxlint-disable-next-line eslint/no-await-in-loop -- rounds are sequential on purpose
        const two = await insertJob(c.id, { runId: run, step: round, fan: 1 });
        // oxlint-disable-next-line eslint/no-await-in-loop -- rounds are sequential on purpose
        const [a, b] = await Promise.all([
          openTx(connect()),
          openTx(connect()),
        ]);
        // oxlint-disable-next-line eslint/no-await-in-loop -- rounds are sequential on purpose
        const results = await Promise.allSettled([
          settleIn(a, one, "succeeded").then(() => a.commit()),
          settleIn(b, two, round % 2 === 0 ? "failed" : "succeeded").then(() =>
            b.commit()
          ),
        ]);
        expectAllCommitted(results);
      }
      await expectProjectionHolds(c.id);
      const row = (await readCollectQueue(testDb, c.id)).find(
        (r) => r.id === run
      );
      expect(row).toMatchObject({ kind: "run", state: "failed" });
      expect(row?.members).toHaveLength(20);
    });

    it("two Jobs that share Evidence, settled at once, both stay on it", async () => {
      await resetTestDb();
      const c = await seedCase(testDb);
      const e = await insertEvidence(c.id);
      const p1 = await insertJob(c.id, {
        cap: "evidence.harvest",
        input: { evidenceId: e },
      });
      const p2 = await insertJob(c.id, {
        cap: "network.url.enrich",
        input: { evidenceId: e },
      });
      const release = await holdCaseLock(c.id);
      const [a, b] = await Promise.all([openTx(connect()), openTx(connect())]);
      await settleIn(a, p1, "succeeded");
      await settleIn(b, p2, "failed");
      const commits = [a.commit(), b.commit()];
      await waitForCommitsBlocked(2);
      await release();
      expectAllCommitted(await Promise.allSettled(commits));
      await expectProjectionHolds(c.id);
      const row = (await readCollectQueue(testDb, c.id)).find(
        (r) => r.id === e
      );
      expect(row?.members).toEqual([p1, p2].sort());
    });

    it("a purge racing a settle commits both, and leaves no row of the Case", async () => {
      for (const order of ["settle-holds-row", "purge-first"] as const) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
        await resetTestDb();
        // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
        const c = await seedCase(testDb);
        // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
        const e = await insertEvidence(c.id);
        // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
        const j = await insertJob(c.id, {
          cap: "evidence.harvest",
          input: { evidenceId: e },
        });
        // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
        expect((await readCollectQueue(testDb, c.id)).length).toBeGreaterThan(
          0
        );
        // The tombstone committed earlier (the owner skips the lifecycle records).
        // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
        await setup().owner.unsafe(
          "update public.cases set deleted_at = now(), purge_after = now() where id = $1",
          [c.id]
        );
        // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
        const settler = await openTx(connect());
        // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
        const purger = await openTx(connect("owner"));
        let results: PromiseSettledResult<unknown>[];
        if (order === "settle-holds-row") {
          // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
          await settleIn(settler, j, "succeeded");
          const purge = purger.run("delete from public.cases where id = $1", [
            c.id,
          ]);
          // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
          await waitForWaiters("delete from public.cases", 1);
          const settled = settler.commit();
          // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
          results = await Promise.allSettled([
            settled,
            purge.then(() => purger.commit()),
          ]);
        } else {
          // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
          await purger.run("delete from public.cases where id = $1", [c.id]);
          const settle = settleIn(settler, j, "succeeded");
          // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
          await waitForWaiters("for update", 1);
          const purged = purger.commit();
          // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
          results = await Promise.allSettled([
            purged,
            settle.then(() => settler.commit()),
          ]);
        }
        expectAllCommitted(results);
        // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
        expect(await readCollectQueue(testDb, c.id)).toEqual([]);
        // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario after the other
        expect(await listCollectQueueStale()).toEqual([]);
      }
    });
  }
);
