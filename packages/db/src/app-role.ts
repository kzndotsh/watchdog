import type postgres from "postgres";

/**
 * The application role: the login the web app and worker connect as. It owns nothing, has no DDL
 * and no CREATE anywhere, and gets only data privileges, so an application bug or a compromised
 * process cannot alter or drop a table or switch off a trigger. The owner role (the one that runs
 * migrations, the first-admin command and vault rotation) creates and owns every object. The role
 * itself is created by the database init (`docker/postgres/`), never here.
 */
export const APP_ROLE = "watchdog_app";

/** Schemas the application reads and writes: product tables, Better Auth and pg-boss. */
const APP_SCHEMAS = ["public", "auth", "pgboss"] as const;

/**
 * Append-only audit tables in `public`. The application may SELECT and INSERT, never change or
 * remove a row. A table that does not exist yet is skipped, so the list can name tables that
 * arrive in a later migration; it is applied again after every migration run.
 */
const AUDIT_TABLES = [
  "graph_writes",
  "case_deletion_records",
  "provider_calls",
  "provider_call_outcomes",
  "evidence_provider_calls",
] as const;

/**
 * Audit tables the application may only read: `graph_history` is written by database triggers
 * (SECURITY DEFINER, run as the owner), so the application needs no INSERT and could not forge
 * a row with one.
 */
const READ_ONLY_AUDIT_TABLES = ["graph_history"] as const;

/**
 * Derived tables the database maintains itself (Collect's queue, #574): triggers and SECURITY
 * DEFINER functions write them, so the application may only read them.
 */
const READ_ONLY_DERIVED_TABLES = [
  "collect_queue",
  "collect_queue_member",
] as const;

/**
 * The projection's own bookkeeping (the per-transaction flush marker, failed flushes, the drift
 * check's round robin): only the owner's functions touch them, so the application gets nothing.
 */
const INTERNAL_TABLES = [
  "collect_queue_tx",
  "collect_queue_stale",
  "collect_queue_case",
] as const;

/**
 * Collect's callable SECURITY DEFINER functions (the flush, a Case's rebuild, the drift check):
 * revoked from PUBLIC by their migration, so the application role is the only caller.
 */
const APP_FUNCTIONS = [
  "collect_queue_flush()",
  "collect_queue_rebuild(uuid)",
  "collect_queue_find_drift(integer)",
] as const;

const TABLE_PRIVILEGES = "SELECT, INSERT, UPDATE, DELETE";
const SEQUENCE_PRIVILEGES = "USAGE, SELECT";
const AUDIT_REVOKED = "UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES";

export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Statements that make `role` usable but harmless in `schema`, for tables the caller creates. */
function schemaStatements(schema: string, role: string): string[] {
  const s = quoteIdent(schema);
  const r = quoteIdent(role);
  const defaults = `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA ${s}`;
  return [
    `GRANT USAGE ON SCHEMA ${s} TO ${r}`,
    `REVOKE CREATE ON SCHEMA ${s} FROM ${r}`,
    // Start from nothing, so a privilege granted by hand (TRUNCATE, TRIGGER, REFERENCES) is dropped.
    `REVOKE ALL ON ALL TABLES IN SCHEMA ${s} FROM ${r}`,
    `GRANT ${TABLE_PRIVILEGES} ON ALL TABLES IN SCHEMA ${s} TO ${r}`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${s} FROM ${r}`,
    `GRANT ${SEQUENCE_PRIVILEGES} ON ALL SEQUENCES IN SCHEMA ${s} TO ${r}`,
    // Tables and sequences the owner creates later (the next migration) start out usable.
    `${defaults} REVOKE ALL ON TABLES FROM ${r}`,
    `${defaults} GRANT ${TABLE_PRIVILEGES} ON TABLES TO ${r}`,
    `${defaults} REVOKE ALL ON SEQUENCES FROM ${r}`,
    `${defaults} GRANT ${SEQUENCE_PRIVILEGES} ON SEQUENCES TO ${r}`,
  ];
}

type Statements = Pick<postgres.Sql, "unsafe">;

async function exists(sql: Statements, query: string, ...params: string[]) {
  const rows = await sql.unsafe(query, params);
  return rows.length > 0;
}

/**
 * Give the application role exactly the privileges it needs, idempotently, in one transaction (a
 * running app never sees the role half-granted). A no-op when the role does not exist (a
 * development database without the split). Run by the owner after every migration run, because
 * the audit revocations cannot live in a migration: a table created later takes the default
 * privileges, which include UPDATE and DELETE.
 *
 * - CREATE on the database and on every application schema is revoked.
 * - Every table and sequence in the application schemas is regranted from scratch, and default
 *   privileges are set for objects the owner creates later.
 * - The audit tables lose UPDATE, DELETE, TRUNCATE, TRIGGER and REFERENCES; the read-only ones
 *   (`graph_history`, and Collect's queue projection) lose INSERT too; the projection's
 *   bookkeeping tables lose everything.
 * - Collect's callable SECURITY DEFINER functions, revoked from PUBLIC, are granted EXECUTE.
 */
export async function applyAppRoleGrants(
  sql: postgres.Sql,
  role: string = APP_ROLE
): Promise<{ applied: boolean }> {
  return sql.begin(async (tx) => {
    if (
      !(await exists(tx, "select 1 from pg_roles where rolname = $1", role))
    ) {
      return { applied: false };
    }
    const r = quoteIdent(role);

    const [database] = await tx.unsafe("select current_database() as name");
    const schemas = await tx.unsafe(
      "select nspname from pg_namespace where nspname = any($1::text[])",
      [[...APP_SCHEMAS]]
    );
    const audit = await tx.unsafe(
      `select relname from pg_class
        where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
          and relname = any($1::text[])`,
      [[...AUDIT_TABLES, ...READ_ONLY_AUDIT_TABLES]]
    );
    const derived = await tx.unsafe(
      `select relname from pg_class
        where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
          and relname = any($1::text[])`,
      [[...READ_ONLY_DERIVED_TABLES, ...INTERNAL_TABLES]]
    );

    const functions = await tx.unsafe(
      "select signature from unnest($1::text[]) as signature where to_regprocedure('public.' || signature) is not null",
      [[...APP_FUNCTIONS]]
    );

    // One multi-statement query: the whole set applies together or not at all.
    const statements = [
      `REVOKE CREATE ON DATABASE ${quoteIdent(String(database?.name))} FROM ${r}`,
      ...schemas.flatMap((row) => schemaStatements(String(row.nspname), role)),
      ...audit.map((row) => {
        const name = String(row.relname);
        const revoked = (READ_ONLY_AUDIT_TABLES as readonly string[]).includes(
          name
        )
          ? `INSERT, ${AUDIT_REVOKED}`
          : AUDIT_REVOKED;
        return `REVOKE ${revoked} ON TABLE public.${quoteIdent(name)} FROM ${r}`;
      }),
      ...derived.map((row) => {
        const name = String(row.relname);
        const revoked = (INTERNAL_TABLES as readonly string[]).includes(name)
          ? "ALL"
          : `INSERT, ${AUDIT_REVOKED}`;
        return `REVOKE ${revoked} ON TABLE public.${quoteIdent(name)} FROM ${r}`;
      }),
      ...functions.map(
        (row) =>
          `GRANT EXECUTE ON FUNCTION public.${String(row.signature)} TO ${r}`
      ),
    ];
    await tx.unsafe(statements.join(";\n"));
    return { applied: true };
  });
}
