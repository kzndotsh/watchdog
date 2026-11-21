import type postgres from "postgres";

/**
 * The application role: the login the web app and worker connect as. It owns nothing, has no DDL
 * and no CREATE anywhere, and gets only data privileges, so an application bug or a compromised
 * process cannot alter or drop a table or switch off a trigger. The owner role (the one that runs
 * migrations, the first-admin command and vault rotation) creates and owns every object. The role
 * itself is created by the database init (`docker/postgres/`), never here.
 */
export const APP_ROLE = "watchdog_app";

/**
 * The machine role (#720): the login the worker connects as, and the role the web app switches an
 * API-key request to for its transactions (`workerRoleDb`, a transaction-local role change, which
 * `watchdog_app` may make because it is granted membership with SET and without INHERIT). It has
 * the application role's privileges except any write to the Graph: Cap Jobs and agents write
 * Evidence, provider calls, Proposals and Jobs, and only Triage Accept, a Dossier edit or the agent
 * escape hatch (a `graph:write` request, which keeps `watchdog_app`) reaches the Graph. Created by
 * the database init, like `watchdog_app`, never here. This stops bugs, not an attacker who can run
 * SQL as `watchdog_app`: such an attacker can reset the role.
 */
export const WORKER_ROLE = "watchdog_worker";

/**
 * Schemas the application reads and writes: product tables, Better Auth and pg-boss. The data
 * privileges on `pgboss` are all a Job's enqueue needs: the delivery is inserted into
 * `pgboss.job` on the application's own transaction (`jobQueueTx`, #721).
 */
const APP_SCHEMAS = ["public", "auth", "pgboss"] as const;

/**
 * Append-only audit tables in `public`. The application may SELECT and INSERT, never change or
 * remove a row. A table that does not exist yet is skipped, so the list can name tables that
 * arrive in a later migration; it is applied again after every migration run.
 */
const AUDIT_TABLES = [
  "changesets",
  "case_deletion_records",
  "provider_calls",
  "provider_call_outcomes",
  "evidence_provider_calls",
  // Rejected-Proposal memory: inserted by Triage, never edited or removed by the application.
  "finding_suppressions",
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
/**
 * The Graph (the tables `graph_history` records, and their Evidence links): the worker role reads
 * them and writes none. A Case purge still removes their rows: a cascade runs as the table owner.
 */
const GRAPH_TABLES = [
  "entities",
  "edges",
  "identifiers",
  "claims",
  "events",
  "questions",
  "tasks",
  "claim_evidence",
  "identifier_evidence",
  "edge_evidence",
] as const;

/**
 * Other tables only a person's decision writes, which the worker role may only read: Triage's
 * rejected-Proposal memory (a reject needs a signed-in session).
 */
const WORKER_READ_ONLY_TABLES = ["finding_suppressions"] as const;

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
 * Callable SECURITY DEFINER functions (Collect's flush, a Case's rebuild and the drift check; the
 * reads past row-level security of trusted paths: a Case's or a Job's organization, the activity
 * log as a whole): revoked from PUBLIC by their migration, so the application and worker roles
 * are the only callers.
 */
const APP_FUNCTIONS = [
  "collect_queue_flush()",
  "collect_queue_rebuild(uuid)",
  "collect_queue_find_drift(integer)",
  // A Case's organization for the worker's trusted paths (row-level security, #718).
  "case_organization_id(uuid)",
  // A Job's organization, for the worker that holds a Job id from the queue (#719).
  "job_organization_id(uuid)",
  // The activity log as a whole, for the process-wide tailer and a cursor's bounds (#719).
  "activity_log_drain(xid8, bigint, integer)",
  "activity_log_has_past(xid8, bigint)",
  "activity_log_newest(boolean)",
] as const;

type RoleKind = "app" | "worker";

const TABLE_PRIVILEGES = "SELECT, INSERT, UPDATE, DELETE";
const SEQUENCE_PRIVILEGES = "USAGE, SELECT";
const AUDIT_REVOKED = "UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES";

export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Statements that make `role` usable but harmless in `schema`, for tables the caller creates. The
 * worker role only reads Better Auth's tables: users, organizations and keys are written by Better
 * Auth (the web process, as `watchdog_app`), never by a Job or a key request.
 */
function schemaStatements(
  schema: string,
  role: string,
  kind: RoleKind
): string[] {
  const s = quoteIdent(schema);
  const r = quoteIdent(role);
  const defaults = `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA ${s}`;
  const tables =
    kind === "worker" && schema === "auth" ? "SELECT" : TABLE_PRIVILEGES;
  return [
    `GRANT USAGE ON SCHEMA ${s} TO ${r}`,
    `REVOKE CREATE ON SCHEMA ${s} FROM ${r}`,
    // Start from nothing, so a privilege granted by hand (TRUNCATE, TRIGGER, REFERENCES) is dropped.
    `REVOKE ALL ON ALL TABLES IN SCHEMA ${s} FROM ${r}`,
    `GRANT ${tables} ON ALL TABLES IN SCHEMA ${s} TO ${r}`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${s} FROM ${r}`,
    `GRANT ${SEQUENCE_PRIVILEGES} ON ALL SEQUENCES IN SCHEMA ${s} TO ${r}`,
    // Tables and sequences the owner creates later (the next migration) start out usable.
    `${defaults} REVOKE ALL ON TABLES FROM ${r}`,
    `${defaults} GRANT ${tables} ON TABLES TO ${r}`,
    `${defaults} REVOKE ALL ON SEQUENCES FROM ${r}`,
    `${defaults} GRANT ${SEQUENCE_PRIVILEGES} ON SEQUENCES TO ${r}`,
  ];
}

type Statements = Pick<postgres.Sql, "unsafe">;

async function exists(sql: Statements, query: string, ...params: string[]) {
  const rows = await sql.unsafe(query, params);
  return rows.length > 0;
}

async function roleExists(sql: Statements, role: string) {
  return exists(sql, "select 1 from pg_roles where rolname = $1", role);
}

/** The `public` tables among `names` that exist now (a later migration may add the rest). */
async function existingTables(sql: Statements, names: readonly string[]) {
  const rows = await sql.unsafe(
    `select relname from pg_class
      where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
        and relname = any($1::text[])`,
    [[...names]]
  );
  return rows.map((row) => String(row.relname));
}

const listed = (list: readonly string[], name: string) => list.includes(name);

/** The statements that give `role` exactly its privileges (see `applyAppRoleGrants`). */
async function roleStatements(
  tx: Statements,
  role: string,
  kind: RoleKind
): Promise<string[]> {
  const r = quoteIdent(role);
  const [database] = await tx.unsafe("select current_database() as name");
  const schemas = await tx.unsafe(
    "select nspname from pg_namespace where nspname = any($1::text[])",
    [[...APP_SCHEMAS]]
  );
  const audit = await existingTables(tx, [
    ...AUDIT_TABLES,
    ...READ_ONLY_AUDIT_TABLES,
  ]);
  const derived = await existingTables(tx, [
    ...READ_ONLY_DERIVED_TABLES,
    ...INTERNAL_TABLES,
  ]);
  const readOnly =
    kind === "worker"
      ? await existingTables(tx, [...GRAPH_TABLES, ...WORKER_READ_ONLY_TABLES])
      : [];
  const functions = await tx.unsafe(
    "select signature from unnest($1::text[]) as signature where to_regprocedure('public.' || signature) is not null",
    [[...APP_FUNCTIONS]]
  );
  return [
    `REVOKE CREATE ON DATABASE ${quoteIdent(String(database?.name))} FROM ${r}`,
    ...schemas.flatMap((row) =>
      schemaStatements(String(row.nspname), role, kind)
    ),
    ...audit.map((name) => {
      const revoked = listed(READ_ONLY_AUDIT_TABLES, name)
        ? `INSERT, ${AUDIT_REVOKED}`
        : AUDIT_REVOKED;
      return `REVOKE ${revoked} ON TABLE public.${quoteIdent(name)} FROM ${r}`;
    }),
    ...derived.map((name) => {
      const revoked = listed(INTERNAL_TABLES, name)
        ? "ALL"
        : `INSERT, ${AUDIT_REVOKED}`;
      return `REVOKE ${revoked} ON TABLE public.${quoteIdent(name)} FROM ${r}`;
    }),
    ...readOnly.map(
      (name) =>
        `REVOKE INSERT, ${AUDIT_REVOKED} ON TABLE public.${quoteIdent(name)} FROM ${r}`
    ),
    ...functions.map(
      (row) =>
        `GRANT EXECUTE ON FUNCTION public.${String(row.signature)} TO ${r}`
    ),
  ];
}

/**
 * Give the application role and the worker role exactly the privileges they need, idempotently,
 * in one transaction (a running app never sees a role half-granted). A role that does not exist (a
 * development database without the split) is skipped. Run by the owner after every migration run,
 * because the revocations cannot live in a migration: a table created later takes the default
 * privileges, which include UPDATE and DELETE.
 *
 * For both roles:
 * - CREATE on the database and on every application schema is revoked.
 * - Every table and sequence in the application schemas is regranted from scratch, and default
 *   privileges are set for objects the owner creates later.
 * - The audit tables lose UPDATE, DELETE, TRUNCATE, TRIGGER and REFERENCES; the read-only ones
 *   (`graph_history`, and Collect's queue projection) lose INSERT too; the projection's
 *   bookkeeping tables lose everything.
 * - The callable SECURITY DEFINER functions, revoked from PUBLIC, are granted EXECUTE.
 *
 * The worker role (#720) also loses every write to the Graph tables and to Triage's suppressions,
 * and reads Better Auth's tables only. When both roles exist, the application role is made a
 * member of the worker role with SET and without INHERIT: it may switch to it (an API-key request)
 * and gains none of its privileges, which are a subset of its own anyway.
 */
export async function applyAppRoleGrants(
  sql: postgres.Sql,
  roles: { readonly app?: string; readonly worker?: string } = {}
): Promise<{ applied: boolean; workerApplied: boolean }> {
  const app = roles.app ?? APP_ROLE;
  const worker = roles.worker ?? WORKER_ROLE;
  return sql.begin(async (tx) => {
    const hasApp = await roleExists(tx, app);
    const hasWorker = await roleExists(tx, worker);
    const statements = [
      ...(hasApp ? await roleStatements(tx, app, "app") : []),
      ...(hasWorker ? await roleStatements(tx, worker, "worker") : []),
      ...(hasApp && hasWorker
        ? [
            `GRANT ${quoteIdent(worker)} TO ${quoteIdent(app)} WITH INHERIT FALSE, SET TRUE`,
          ]
        : []),
    ];
    // One multi-statement query: the whole set applies together or not at all.
    if (statements.length > 0) await tx.unsafe(statements.join(";\n"));
    return { applied: hasApp, workerApplied: hasWorker };
  });
}
