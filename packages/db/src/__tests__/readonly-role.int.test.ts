import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The local-only read-only role the dev MCP Postgres server connects as
 * (`.mcp.json`, `scripts/ensure-readonly-role.sh`). Connects as that role to the
 * integration database and checks the boundary from the outside: reads work,
 * writes and DDL are denied, and credential tables are not readable.
 */
const READONLY_USER = "watchdog_readonly";
const READONLY_PASSWORD = "watchdog_readonly";

/** Tables that hold credentials or bearer secrets. Documented in docs/how-to/local-dev.md. */
const EXCLUDED_TABLES = [
  "auth.account",
  "auth.apikey",
  "auth.session",
  "auth.verification",
  "auth.invitation",
  "public.credentials",
] as const;

/** App data the agent is meant to inspect. */
const READABLE_TABLES = [
  "auth.user",
  "auth.organization",
  "auth.member",
  "auth.auth_event",
  "public.cases",
  "public.claims",
  "public.entities",
  "public.evidence",
  "public.jobs",
  "public.proposals",
] as const;

function readonlyUrl(): string {
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.username = READONLY_USER;
  url.password = READONLY_PASSWORD;
  return url.toString();
}

let ro: ReturnType<typeof postgres>;

beforeAll(async () => {
  // One connection, with the session read-only default switched off, so the
  // denials below prove the GRANTs, not the role's default (checked separately).
  ro = postgres(readonlyUrl(), { max: 1, idle_timeout: 5 });
  await ro.unsafe("set default_transaction_read_only = off");
});

afterAll(async () => {
  await ro.end({ timeout: 5 });
});

/** 42501 = insufficient_privilege. */
const denied = async (statement: string) => {
  await expect(ro.unsafe(statement)).rejects.toMatchObject({ code: "42501" });
};

describe("watchdog_readonly role", () => {
  it("is a plain login role: no superuser, createdb, createrole or bypassrls", async () => {
    const [row] = await ro`
      select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication
      from pg_roles where rolname = ${READONLY_USER}`;
    expect(row).toEqual({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
      rolreplication: false,
    });
  });

  it.each(READABLE_TABLES)("can SELECT from %s", async (table) => {
    const rows = await ro.unsafe(`select 1 from ${table} limit 1`);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("denies INSERT, UPDATE, DELETE and TRUNCATE on app tables", async () => {
    await denied(
      "insert into public.questions (id) values (gen_random_uuid())"
    );
    await denied("update public.cases set name = 'x'");
    await denied("delete from public.cases");
    await denied("truncate public.cases");
    await denied("update auth.user set name = 'x'");
  });

  it("denies DDL and creating objects in any schema", async () => {
    await denied("create table public.ro_probe (id int)");
    await denied("create table auth.ro_probe (id int)");
    await denied("create schema ro_probe");
    await denied("drop table public.cases");
    await denied("alter table public.cases add column ro_probe int");
  });

  it("starts every session read-only and time-boxed", async () => {
    const fresh = postgres(readonlyUrl(), { max: 1, idle_timeout: 5 });
    try {
      const [row] =
        await fresh`select current_setting('default_transaction_read_only') as ro, current_setting('statement_timeout') as timeout`;
      expect(row).toEqual({ ro: "on", timeout: "30s" });
      await expect(
        fresh.unsafe("create temp table ro_probe (id int)")
      ).rejects.toMatchObject({ code: "25006" });
    } finally {
      await fresh.end({ timeout: 5 });
    }
  });

  it.each(EXCLUDED_TABLES)(
    "denies SELECT on credential table %s",
    async (table) => {
      await expect(
        ro.unsafe(`select * from ${table} limit 1`)
      ).rejects.toMatchObject({ code: "42501" });
    }
  );

  it("exposes no column that looks like a secret on any table it can read", async () => {
    const rows = await ro`
      select table_schema, table_name, column_name
      from information_schema.columns
      where table_schema in ('public', 'auth')
        and column_name ~* '(password|token|secret|ciphertext|^key$)'`;
    expect(rows).toEqual([]);
  });

  it("covers every public and auth table: readable, or listed as excluded", async () => {
    const tables = await ro<{ name: string; readable: boolean }[]>`
      select format('%s.%s', n.nspname, c.relname) as name,
             has_table_privilege(c.oid, 'SELECT') as readable
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and n.nspname in ('public', 'auth')`;
    const unreadable = tables.filter((t) => !t.readable).map((t) => t.name);
    expect([...unreadable].sort()).toEqual([...EXCLUDED_TABLES].sort());
  });
});
