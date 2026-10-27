import { describe, expect, it } from "vitest";

import { client } from "@watchdog/db";

import { APP_ROLE } from "../app-role";

/**
 * Every `public` table says how its rows behave, and the database is held to it. A new table fails
 * here until it is added to exactly one list below: that is the moment to decide whether its rows
 * change (a record: `created_at`, `updated_at` and the `touch_updated_at` trigger), never change (a
 * log: the application role may not UPDATE it), or are something else (a link, a projection, a
 * counter: exempt, with the reason). (Read from `pg_class`, not `information_schema`, which hides the tables the application role cannot touch.) Drizzle's migration journal lives in the `drizzle` schema and
 * Better Auth's tables in `auth`, so neither appears here.
 */

/** Rows change: edited by people, Jobs or the worker. Need `created_at`, `updated_at` and the touch trigger. */
const RECORDS = [
  "cases",
  "claims",
  "credentials",
  "edges",
  "entities",
  "events",
  "evidence",
  "evidence_uploads",
  "identifiers",
  "job_start_limits",
  "jobs",
  "organization_settings",
  "playbook_runs",
  "proposals",
  "questions",
  "tasks",
] as const;

/** Rows are inserted and never change. Need `created_at`; the application role has no UPDATE. */
const APPEND_ONLY = [
  "evidence_provider_calls",
  "finding_suppressions",
  "graph_writes",
  "provider_call_outcomes",
  "provider_calls",
] as const;

/** Evidence links: inserted and deleted, never edited. Need `created_at` (when linked), no `updated_at`. */
const LINKS = [
  "claim_evidence",
  "edge_evidence",
  "identifier_evidence",
  "job_evidence",
  "proposal_evidence",
] as const;

/** Neither a record nor an append-only log. Each says why. */
const EXEMPT: Record<string, string> = {
  activity:
    "the change log: written once, but the restore repair rewrites `xid` (`zeroXids`) and retention prunes it",
  activity_cursors:
    "a consumer's read position: overwritten in place, `updated_at` is the last move",
  activity_floor:
    "the retention floor: one row that only moves forward, `updated_at` is the last move",
  cap_cache:
    "a cache: a re-run overwrites the row and restarts its TTL by resetting `created_at`",
  case_deletion_records:
    "an audit log with its own time column, `occurred_at`; the application role has no UPDATE",
  collect_queue:
    "Collect's queue projection: written by triggers, never by the app",
  collect_queue_case: "the projection's drift-check round robin",
  collect_queue_member: "the projection's membership rows: written by triggers",
  collect_queue_stale: "the projection's failed-flush log",
  collect_queue_tx: "the projection's per-transaction flush marker",
  graph_history:
    "the Graph audit trail, written by triggers with its own time column; no UPDATE for anyone",
  job_start_counters:
    "a rate counter per window (`window_start`), upserted and pruned; not a record",
};

const HAS_TOUCH_TRIGGER = `
  exists (
    select 1 from pg_trigger tg
    where tg.tgrelid = c.oid and not tg.tgisinternal
      and tg.tgfoid = 'public.touch_updated_at'::regproc
      and (tg.tgtype & 1) = 1 and (tg.tgtype & 2) = 2 and (tg.tgtype & 16) = 16
  )`;

type TableFacts = {
  name: string;
  columns: string[];
  touched: boolean;
  appCanUpdate: boolean;
};

async function publicTables(): Promise<TableFacts[]> {
  const rows = await client.unsafe<
    {
      name: string;
      columns: string[];
      touched: boolean;
      app_can_update: boolean;
    }[]
  >(
    `select c.relname::text as name,
            array(select a.attname::text from pg_attribute a
                   where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns,
            ${HAS_TOUCH_TRIGGER} as touched,
            has_table_privilege($1, c.oid, 'UPDATE') as app_can_update
       from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      order by 1`,
    [APP_ROLE]
  );
  return rows.map((row) => ({
    name: row.name,
    columns: row.columns,
    touched: row.touched,
    appCanUpdate: row.app_can_update,
  }));
}

describe("public table classification", () => {
  it("puts every table in exactly one list", async () => {
    const tables = (await publicTables()).map((t) => t.name);
    const lists = [
      ...RECORDS,
      ...APPEND_ONLY,
      ...LINKS,
      ...Object.keys(EXEMPT),
    ];
    expect(
      new Set(lists).size,
      "a table is in two lists, or twice in one"
    ).toBe(lists.length);

    const unclassified = tables.filter((name) => !lists.includes(name));
    expect(
      unclassified,
      `Classify ${unclassified.join(", ")} in table-classification.int.test.ts: a record (rows change), append-only (rows never change), a link, or exempt with a reason.`
    ).toEqual([]);

    const gone = lists.filter((name) => !tables.includes(name));
    expect(gone, "listed but no longer a table: remove it").toEqual([]);
  });

  it("gives a record created_at, updated_at and the touch trigger", async () => {
    const facts = (await publicTables()).filter((t) =>
      (RECORDS as readonly string[]).includes(t.name)
    );
    expect(facts.length).toBe(RECORDS.length);
    for (const t of facts) {
      expect(t.columns, `${t.name} columns`).toEqual(
        expect.arrayContaining(["created_at", "updated_at"])
      );
      expect(t.touched, `${t.name} has the touch_updated_at trigger`).toBe(
        true
      );
    }
  });

  it("gives an append-only table created_at and denies the application role UPDATE", async () => {
    const facts = (await publicTables()).filter((t) =>
      (APPEND_ONLY as readonly string[]).includes(t.name)
    );
    expect(facts.length).toBe(APPEND_ONLY.length);
    for (const t of facts) {
      expect(t.columns, `${t.name} columns`).toContain("created_at");
      expect(t.columns, `${t.name} never changes`).not.toContain("updated_at");
      expect(t.appCanUpdate, `${APP_ROLE} may UPDATE ${t.name}`).toBe(false);
    }
  });

  it("gives an Evidence link created_at and no updated_at", async () => {
    const facts = (await publicTables()).filter((t) =>
      (LINKS as readonly string[]).includes(t.name)
    );
    expect(facts.length).toBe(LINKS.length);
    for (const t of facts) {
      expect(t.columns, `${t.name} columns`).toContain("created_at");
      expect(t.columns, `${t.name} is never edited`).not.toContain(
        "updated_at"
      );
    }
  });

  it("touches updated_at on every table that has the column, listed or not", async () => {
    const untouched = (await publicTables())
      .filter((t) => t.columns.includes("updated_at") && !t.touched)
      .map((t) => t.name);
    expect(
      untouched,
      "attach touch_updated_at (see 0018_touch_updated_at.sql) to each"
    ).toEqual([]);
  });

  it("sets updated_at in the database on a raw UPDATE, and lets a statement that sets it win", async () => {
    // `activity_cursors` has no foreign key and the application role may write it.
    const consumer = "touch-updated-at-test";
    const read = async () => {
      const rows = await client<{ fresh: boolean; old: boolean }[]>`
        select updated_at > now() - interval '1 minute' as fresh,
               updated_at = '2001-01-01T00:00:00Z' as old
          from activity_cursors where consumer = ${consumer}`;
      return rows[0];
    };
    try {
      await client`insert into activity_cursors (consumer, xid, id, updated_at)
        values (${consumer}, '0', 0, '2001-01-01T00:00:00Z')`;
      expect(await read()).toEqual({ fresh: false, old: true });

      await client`update activity_cursors set id = 1 where consumer = ${consumer}`;
      expect(await read()).toEqual({ fresh: true, old: false });

      await client`update activity_cursors set id = 2, updated_at = '2001-01-01T00:00:00Z'
        where consumer = ${consumer}`;
      expect(await read()).toEqual({ fresh: false, old: true });
    } finally {
      await client`delete from activity_cursors where consumer = ${consumer}`;
    }
  });
});
