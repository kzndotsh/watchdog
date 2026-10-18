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
const AUDIT_TABLES = ["graph_writes"] as const;

/**
 * Audit tables the application may only read: `graph_history` is written by database triggers
 * (SECURITY DEFINER, run as the owner), so the application needs no INSERT and could not forge
 * a row with one.
 */
const READ_ONLY_AUDIT_TABLES = ["graph_history"] as const;

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
    // Start from nothing: an earlier setup granted ALL (TRUNCATE, TRIGGER, REFERENCES).
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
 * - Anything the role owns (a database set up before the split let it create pg-boss's schema) is
 *   reassigned to the owner, so it holds no ownership.
 * - CREATE on the database and on every application schema is revoked.
 * - Every table and sequence in the application schemas is regranted from scratch, and default
 *   privileges are set for objects the owner creates later.
 * - The audit tables lose UPDATE, DELETE, TRUNCATE, TRIGGER and REFERENCES; the read-only ones
 *   (`graph_history`) lose INSERT too.
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

    const owned = await tx.unsafe(
      `select count(*)::int as n from pg_shdepend d
         join pg_roles r on r.oid = d.refobjid
        where d.refclassid = 'pg_authid'::regclass and d.deptype = 'o'
          and d.dbid = (select oid from pg_database where datname = current_database())
          and r.rolname = $1`,
      [role]
    );
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

    // One multi-statement query: the whole set applies together or not at all.
    const statements = [
      ...(Number(owned[0]?.n) > 0
        ? [`REASSIGN OWNED BY ${r} TO CURRENT_USER`]
        : []),
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
    ];
    await tx.unsafe(statements.join(";\n"));
    return { applied: true };
  });
}
