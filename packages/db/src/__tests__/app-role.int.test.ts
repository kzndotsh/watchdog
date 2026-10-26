import { randomBytes } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../migrate";

/**
 * The role split: an owner role owns the schema and runs migrations; the application role has
 * data privileges only. A private throwaway database and role (never `watchdog_test`, never the
 * shared `watchdog_app`) are made the way `docker/postgres/` makes them, migrated as the owner
 * (`DATABASE_URL_MIGRATE`, a role that may create databases and roles), and probed from the
 * outside as the application role.
 */
const suffix = randomBytes(4).toString("hex");
const DATABASE = `wd_role_${suffix}`;
const APP_ROLE = `wd_role_app_${suffix}`;
const APP_PASSWORD = "role-test-password";
const MIGRATIONS = path.resolve(import.meta.dirname, "../../drizzle");

const ownerUrl = process.env.DATABASE_URL_MIGRATE ?? "";

function urlFor(
  database: string,
  credentials?: { user: string; password: string }
) {
  const url = new URL(ownerUrl);
  url.pathname = `/${database}`;
  if (credentials) {
    url.username = credentials.user;
    url.password = credentials.password;
  }
  return url.toString();
}

const connect = (url: string) =>
  postgres(url, { max: 1, idle_timeout: 5, onnotice: () => {} });

let admin: ReturnType<typeof postgres>;
let owner: ReturnType<typeof postgres>;
let app: ReturnType<typeof postgres>;
let laterMigrations: string;

/** 42501 = insufficient_privilege (also "must be owner of table"). */
const denied = async (statement: string) => {
  await expect(app.unsafe(statement)).rejects.toMatchObject({ code: "42501" });
};

const migrate = (folder = MIGRATIONS) =>
  runMigrations({
    url: urlFor(DATABASE),
    migrationsFolder: folder,
    appRole: APP_ROLE,
  });

/** The real migrations plus one more, as a later release would add: two new tables. */
function withLaterMigration(): string {
  const folder = mkdtempSync(path.join(tmpdir(), "wd-role-migrations-"));
  cpSync(MIGRATIONS, folder, { recursive: true });
  const journalPath = path.join(folder, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
    entries: {
      idx: number;
      version: string;
      when: number;
      tag: string;
      breakpoints: boolean;
    }[];
  };
  const last = journal.entries.at(-1);
  journal.entries.push({
    idx: (last?.idx ?? 0) + 1,
    version: "7",
    when: (last?.when ?? 0) + 1000,
    tag: "9999_role_probe",
    breakpoints: true,
  });
  writeFileSync(journalPath, JSON.stringify(journal));
  writeFileSync(
    path.join(folder, "9999_role_probe.sql"),
    ['CREATE TABLE "role_probe" ("id" serial PRIMARY KEY, "note" text);'].join(
      "\n"
    )
  );
  return folder;
}

beforeAll(async () => {
  admin = connect(urlFor("postgres"));
  await admin.unsafe(`CREATE DATABASE ${DATABASE}`);
  // What docker/postgres/init.sql does: the login, CONNECT, and the auth schema.
  await admin.unsafe(
    `CREATE ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`
  );
  await admin.unsafe(`GRANT CONNECT ON DATABASE ${DATABASE} TO ${APP_ROLE}`);
  owner = connect(urlFor(DATABASE));
  await owner.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await owner.unsafe("CREATE SCHEMA IF NOT EXISTS auth");
  // A hand-granted CREATE on the schema: the grants revoke it.
  await owner.unsafe(`GRANT CREATE ON SCHEMA public TO ${APP_ROLE}`);

  await migrate();
  app = connect(urlFor(DATABASE, { user: APP_ROLE, password: APP_PASSWORD }));
  laterMigrations = withLaterMigration();
});

afterAll(async () => {
  await app?.end({ timeout: 5 });
  await owner?.end({ timeout: 5 });
  await admin?.unsafe(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
  await admin?.unsafe(`DROP ROLE IF EXISTS ${APP_ROLE}`);
  await admin?.end({ timeout: 5 });
  if (laterMigrations)
    rmSync(laterMigrations, { recursive: true, force: true });
});

describe("application role after migrations run as the owner", () => {
  it("is a plain login role that owns nothing", async () => {
    const [role] = await admin`
      select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication
      from pg_roles where rolname = ${APP_ROLE}`;
    expect(role).toEqual({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
      rolreplication: false,
    });
    const owned = await owner<{ name: string }[]>`
      select c.relname as name from pg_class c
      join pg_roles r on r.oid = c.relowner
      where r.rolname = ${APP_ROLE}`;
    expect(owned).toEqual([]);
  });

  it("reads and writes ordinary tables, auth tables and pg-boss's tables", async () => {
    const [created] = await app`
      insert into public.cases (name, slug, organization_id) values ('Probe', ${`probe-${suffix}`}, 'org-probe') returning id`;
    await app`update public.cases set name = 'Probe 2' where id = ${created!.id}`;
    const [read] =
      await app`select name from public.cases where id = ${created!.id}`;
    expect(read?.name).toBe("Probe 2");
    await app`insert into public.graph_writes (case_id, actor_id, channel, confidence, patch)
      values (${created!.id}, 'actor', 'agent_write', 'unverified', '{}'::jsonb)`;
    await app`select count(*) from auth.organization`;
    await app`delete from pgboss.job where false`;
    await app`select count(*) from pgboss.queue`;
    await app`delete from public.cases where id = ${created!.id}`;
  });

  it("deletes a Case with Evidence links as the app role (the cases delete trigger clears the link tables)", async () => {
    const [c] = await app`
      insert into public.cases (name, slug, organization_id) values ('Links', ${`links-${suffix}`}, 'org-probe') returning id`;
    const caseId = c!.id as string;
    const [ev] = await app`
      insert into public.evidence (case_id, kind, actor_id) values (${caseId}, 'other', 'actor') returning id`;
    const [job] = await app`
      insert into public.jobs (case_id, capability_id, input, actor_id)
      values (${caseId}, 'probe.cap', '{}'::jsonb, 'actor') returning id`;
    const [proposal] = await app`
      insert into public.proposals (case_id, patch) values (${caseId}, '{}'::jsonb) returning id`;
    await app`insert into public.job_evidence (job_id, evidence_id, case_id, position)
      values (${job!.id}, ${ev!.id}, ${caseId}, 0)`;
    await app`insert into public.proposal_evidence (proposal_id, evidence_id, case_id, position)
      values (${proposal!.id}, ${ev!.id}, ${caseId}, 0)`;

    await app`delete from public.cases where id = ${caseId}`;

    const left = await owner`
      select (select count(*) from public.job_evidence where case_id = ${caseId})::int
           + (select count(*) from public.proposal_evidence where case_id = ${caseId})::int
           + (select count(*) from public.evidence where case_id = ${caseId})::int as n`;
    expect(left[0]?.n).toBe(0);
  });

  it("cannot ALTER, DROP or TRUNCATE a table, or disable its triggers", async () => {
    await denied("alter table public.cases add column probe int");
    await denied("drop table public.cases");
    await denied("truncate public.cases");
    await denied("truncate public.cases, public.graph_writes");
    await denied("alter table public.cases disable trigger all");
    await denied("alter table public.graph_writes disable trigger all");
    await denied("alter table pgboss.job add column probe int");
  });

  it("cannot create objects or touch the migration journal", async () => {
    await denied("create table public.app_probe (id int)");
    await denied("create table auth.app_probe (id int)");
    await denied("create table pgboss.app_probe (id int)");
    await denied("create schema app_probe");
    await denied("select * from drizzle.__drizzle_migrations");
  });

  it("can only read and append to graph_writes", async () => {
    await app`select count(*) from public.graph_writes`;
    await denied("update public.graph_writes set summary = 'x'");
    await denied("delete from public.graph_writes");
    await denied("truncate public.graph_writes");
    await denied(
      "create trigger t before insert on public.graph_writes for each row execute function pg_catalog.suppress_redundant_updates_trigger()"
    );
  });

  it("can only read and append to case_deletion_records (#304): the permanent deletion record", async () => {
    const caseId = "00000000-0000-4000-8000-0000000000d1";
    await app`insert into public.case_deletion_records (case_id, organization_id, case_name, case_slug, event, actor_id)
      values (${caseId}, 'org-probe', 'Probe', 'probe', 'deleted', 'actor')`;
    const rows =
      await app`select event from public.case_deletion_records where case_id = ${caseId}`;
    expect(rows.map((row) => row.event)).toEqual(["deleted"]);
    await denied("update public.case_deletion_records set event = 'restored'");
    await denied("delete from public.case_deletion_records");
    await denied("truncate public.case_deletion_records");
    await denied(
      "alter table public.case_deletion_records disable trigger all"
    );
    await denied(
      "create trigger t before insert on public.case_deletion_records for each row execute function pg_catalog.suppress_redundant_updates_trigger()"
    );
  });

  it("purges a Case as the app role: the cascade erases audit rows the role cannot delete itself, and the deletion record stays", async () => {
    const [c] = await app`
      insert into public.cases (name, slug, organization_id, deleted_at, deleted_by)
      values ('Purge', ${`purge-${suffix}`}, 'org-probe', now(), 'actor') returning id`;
    const caseId = c!.id as string;
    await app`insert into public.graph_writes (case_id, actor_id, channel, confidence, patch)
      values (${caseId}, 'actor', 'agent_write', 'unverified', '{}'::jsonb)`;
    await app`insert into public.case_deletion_records (case_id, organization_id, case_name, case_slug, event, actor_id, counts)
      values (${caseId}, 'org-probe', 'Purge', 'purge', 'purged', 'actor', '{"graphWrites": 1}'::jsonb)`;
    await denied("delete from public.graph_writes");

    await app`delete from public.cases where id = ${caseId}`;

    const [gone] =
      await owner`select count(*)::int as n from public.graph_writes where case_id = ${caseId}`;
    const [kept] =
      await owner`select count(*)::int as n from public.case_deletion_records where case_id = ${caseId}`;
    expect(gone?.n).toBe(0);
    expect(kept?.n).toBe(1);
  });

  it("can only read and append to the provider-call tables (#495): calls, outcomes and Evidence links", async () => {
    const [c] = await app`
      insert into public.cases (name, slug, organization_id) values ('Calls', ${`calls-${suffix}`}, 'org-probe') returning id`;
    const caseId = c!.id as string;
    const [ev] = await app`
      insert into public.evidence (case_id, kind, actor_id) values (${caseId}, 'other', 'actor') returning id`;
    const [job] = await app`
      insert into public.jobs (case_id, capability_id, input, actor_id)
      values (${caseId}, 'probe.cap', '{}'::jsonb, 'actor') returning id`;
    const [call] = await app`
      insert into public.provider_calls (id, case_id, job_id, run_id, seq, transport, method, url_redacted, body_kind, request_body_state, started_at)
      values (gen_random_uuid(), ${caseId}, ${job!.id}, gen_random_uuid(), 0, 'http', 'GET', 'https://probe.test/', 'response', 'none', now()) returning id`;
    await app`insert into public.provider_call_outcomes (call_id, case_id, outcome, status, hops, response_headers, started_at, body_state, ended_at)
      values (${call!.id}, ${caseId}, 'response', 200, '[]'::jsonb, '{}'::jsonb, now(), 'none', now())`;
    await app`insert into public.evidence_provider_calls (evidence_id, call_id, case_id)
      values (${ev!.id}, ${call!.id}, ${caseId})`;

    for (const table of [
      "provider_calls",
      "provider_call_outcomes",
      "evidence_provider_calls",
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one table at a time, in order
      await app.unsafe(`select count(*) from public.${table}`);
      // oxlint-disable-next-line eslint/no-await-in-loop -- one table at a time, in order
      await denied(`delete from public.${table}`);
      // oxlint-disable-next-line eslint/no-await-in-loop -- one table at a time, in order
      await denied(`truncate public.${table}`);
      // oxlint-disable-next-line eslint/no-await-in-loop -- one table at a time, in order
      await denied(`alter table public.${table} disable trigger all`);
    }
    await denied("update public.provider_calls set method = 'POST'");
    await denied("update public.provider_call_outcomes set status = 500");
    await denied("update public.evidence_provider_calls set call_id = call_id");
  });

  it("purges a Case with provider calls and Evidence links as the app role (#495): the trigger clears the links the role cannot delete", async () => {
    const [c] = await app`
      insert into public.cases (name, slug, organization_id, deleted_at, deleted_by)
      values ('Calls purge', ${`calls-purge-${suffix}`}, 'org-probe', now(), 'actor') returning id`;
    const caseId = c!.id as string;
    const [ev] = await app`
      insert into public.evidence (case_id, kind, actor_id) values (${caseId}, 'other', 'actor') returning id`;
    const [job] = await app`
      insert into public.jobs (case_id, capability_id, input, actor_id)
      values (${caseId}, 'probe.cap', '{}'::jsonb, 'actor') returning id`;
    const [call] = await app`
      insert into public.provider_calls (id, case_id, job_id, run_id, seq, transport, method, url_redacted, body_kind, request_body_state, started_at)
      values (gen_random_uuid(), ${caseId}, ${job!.id}, gen_random_uuid(), 0, 'http', 'GET', 'https://probe.test/', 'response', 'none', now()) returning id`;
    await app`insert into public.provider_call_outcomes (call_id, case_id, outcome, status, hops, response_headers, started_at, body_state, ended_at)
      values (${call!.id}, ${caseId}, 'response', 200, '[]'::jsonb, '{}'::jsonb, now(), 'none', now())`;
    await app`insert into public.evidence_provider_calls (evidence_id, call_id, case_id)
      values (${ev!.id}, ${call!.id}, ${caseId})`;

    await app`delete from public.cases where id = ${caseId}`;

    const [left] = await owner`
      select (select count(*) from public.provider_calls where case_id = ${caseId})::int
           + (select count(*) from public.provider_call_outcomes where case_id = ${caseId})::int
           + (select count(*) from public.evidence_provider_calls where case_id = ${caseId})::int
           + (select count(*) from public.evidence where case_id = ${caseId})::int as n`;
    expect(left?.n).toBe(0);
  });
});

describe("a table added by a later migration", () => {
  it("is usable by the application role without a manual grant", async () => {
    await migrate(laterMigrations);
    await app`insert into public.role_probe (note) values ('first')`;
    await app`update public.role_probe set note = 'second'`;
    const [row] = await app`select note from public.role_probe`;
    expect(row?.note).toBe("second");
    await app`delete from public.role_probe`;
    await denied("alter table public.role_probe add column probe int");
    await denied("truncate public.role_probe");
  });

  it("is usable on its own through default privileges, with no regrant", async () => {
    // Created by the owner after the migrator returned: only default privileges can cover it.
    await owner.unsafe(
      "CREATE TABLE public.default_probe (id serial PRIMARY KEY, note text)"
    );
    await app`insert into public.default_probe (note) values ('x')`;
    await app`update public.default_probe set note = 'y'`;
    await app`delete from public.default_probe`;
    await denied("truncate public.default_probe");
    await denied("alter table public.default_probe add column probe int");
  });

  it("is read-only when it is a listed read-only audit table (graph_history, written by triggers)", async () => {
    await app`select count(*) from public.graph_history`;
    await denied(
      "insert into public.graph_history (case_id, kind, row_id, op, channel, after) values (gen_random_uuid(), 'task', gen_random_uuid(), 'create', 'system', '{}'::jsonb)"
    );
    await denied("update public.graph_history set kind = 'x'");
    await denied("delete from public.graph_history");
    await denied("truncate public.graph_history");
    await denied("alter table public.graph_history disable trigger all");
    await denied(
      "select public.graph_history_append(gen_random_uuid(), 'task', gen_random_uuid(), 'create', null, '{}'::jsonb)"
    );
  });

  it("only reads Collect's queue projection, and has nothing on its bookkeeping (#574)", async () => {
    await app`select count(*) from public.collect_queue`;
    await app`select count(*) from public.collect_queue_member`;
    await denied(
      "insert into public.collect_queue_member (job_id, row_id, case_id) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid())"
    );
    await denied("update public.collect_queue set state = 'landed'");
    await denied("delete from public.collect_queue");
    await denied("delete from public.collect_queue_member");
    await denied("truncate public.collect_queue");
    for (const table of [
      "collect_queue_tx",
      "collect_queue_stale",
      "collect_queue_case",
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one denial at a time, each named on failure
      await denied(`select count(*) from public.${table}`);
    }
    // Only the triggers and the flush may record keys or sync rows directly.
    await denied(
      "select public.collect_queue_mark(gen_random_uuid(), null, null, true)"
    );
    await denied(
      "select public.collect_queue_sync(gen_random_uuid(), '{}', '{}', true)"
    );
    // The callables only recompute from the source tables.
    await app`select public.collect_queue_flush()`;
    await app`select public.collect_queue_rebuild(gen_random_uuid())`;
    await app`select * from public.collect_queue_diff(gen_random_uuid())`;
    await app`select * from public.collect_queue_find_drift(0)`;
  });

  it("keeps the revocations when the migrator runs again with nothing to apply", async () => {
    await migrate(laterMigrations);
    await denied("update public.graph_writes set summary = 'x'");
    await denied("delete from public.graph_history");
    await app`insert into public.role_probe (note) values ('after')`;
  });
});

describe("a database without the application role", () => {
  it("migrates and skips the grants", async () => {
    const result = await runMigrations({
      url: urlFor(DATABASE),
      migrationsFolder: laterMigrations,
      appRole: `${APP_ROLE}_absent`,
    });
    expect(result.appRoleGranted).toBe(false);
  });
});
