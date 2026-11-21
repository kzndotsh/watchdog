import { asc, sql } from "drizzle-orm";
import { PgTransaction } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

import type { OrganizationId } from "@watchdog/schemas/shared";

import { WORKER_ROLE } from "./app-role";
import type { Db } from "./client";
import type { DbExec, DbTx } from "./exec";
import { ORGANIZATION_SETTING } from "./history-context";
import { trimCaseId, trimResourceId } from "./repos/_scoped-ids";
import { organization } from "./schema/auth";
import * as schema from "./schema/index";

type Sql = postgres.Sql;
type TransactionBody = (tx: postgres.TransactionSql) => unknown;

/** True for a transaction (or savepoint) handle, false for a pool handle. */
export function isTransaction(exec: DbExec): exec is DbTx {
  return exec instanceof PgTransaction;
}

/**
 * Set the organization for the rest of the transaction `tx` (`watchdog.org_id`, transaction-local,
 * read by the row-level security policies through `graph_history_setting`). On a pool handle it
 * would end with its own one-statement transaction, so it takes a transaction only.
 */
export async function setOrganizationContext(
  tx: DbTx,
  organizationId: OrganizationId
): Promise<void> {
  await tx.execute(
    sql`select set_config(${ORGANIZATION_SETTING}, ${organizationId}, true)`
  );
}

/**
 * The organization of a Case, read past row-level security (`case_organization_id`, SECURITY
 * DEFINER): for trusted paths that hold a Case id from a Job or child row and must scope to its
 * organization before reading the Case (the worker's Job run, reconcile, the Case export). `null`
 * for a missing Case or an id that is not a UUID. Deleted Cases answer too. Never for an id a
 * caller sent: API paths scope to the caller's organization instead.
 */
export async function caseOrganizationIdUnchecked(
  exec: DbExec,
  caseId: string
): Promise<OrganizationId | null> {
  const id = trimCaseId(caseId);
  if (id === undefined) return null;
  const rows = await exec.execute<{ organization_id: OrganizationId | null }>(
    sql`select public.case_organization_id(${id}::uuid) as organization_id`
  );
  return rows[0]?.organization_id ?? null;
}

/**
 * The organization of a Job, read past row-level security (`job_organization_id`, SECURITY
 * DEFINER): for the worker, which holds a Job id from the queue and must scope to the Job's
 * organization before reading it. `null` for a missing Job or an id that is not a UUID. Never for
 * an id a caller sent.
 */
export async function jobOrganizationIdUnchecked(
  exec: DbExec,
  jobId: string
): Promise<OrganizationId | null> {
  const id = trimResourceId(jobId);
  if (id === undefined) return null;
  const rows = await exec.execute<{ organization_id: OrganizationId | null }>(
    sql`select public.job_organization_id(${id}::uuid) as organization_id`
  );
  return rows[0]?.organization_id ?? null;
}

/**
 * Every organization id (Better Auth's `auth.organization`, which row-level security does not
 * cover), oldest first: for maintenance that visits each organization's Cases in its own scope
 * (the scheduled purge, the export consumer's re-scan).
 */
export async function listOrganizationIds(
  exec: DbExec
): Promise<OrganizationId[]> {
  const rows = await exec
    .select({ id: organization.id })
    .from(organization)
    .orderBy(asc(organization.createdAt), asc(organization.id));
  return rows.map((row) => row.id);
}

/**
 * What a scoped handle sets at the start of every transaction: the organization (row-level
 * security) and the role (`WORKER_ROLE` for an API-key request, #720). Either may be absent.
 */
type Scope = {
  readonly organizationId?: OrganizationId;
  readonly role?: string;
};

/** The underlying client and scope of a scoped handle's client, so a scope never wraps another. */
const scopeOf = new WeakMap<
  Sql,
  { readonly base: Sql; readonly scope: Scope }
>();

/** Scoped handles per base client and scope (a handle is a few small objects). */
const handles = new WeakMap<Sql, Map<string, Db>>();

/** Scopes kept per client before the oldest handle is dropped (it is rebuilt on demand). */
const MAX_HANDLES_PER_CLIENT = 256;

/** One statement, so the settings cost no round trip of their own. */
function setScope(
  client: postgres.TransactionSql | postgres.ReservedSql,
  scope: Scope
) {
  const { organizationId, role } = scope;
  if (role === undefined) {
    return client`select set_config(${ORGANIZATION_SETTING}, ${organizationId ?? ""}, true)`;
  }
  if (organizationId === undefined) {
    return client`select set_config('role', ${role}, true)`;
  }
  return client`select set_config(${ORGANIZATION_SETTING}, ${organizationId}, true), set_config('role', ${role}, true)`;
}

/**
 * A postgres.js client whose every statement runs in `scope` (its organization, its role): a
 * transaction sets it as its first statement, and a statement outside one runs in a short
 * transaction of its own that sets it first. The settings are always transaction-local
 * (`set_config(..., true)`), so they never outlive the transaction on a pooled connection. Only
 * the two calls Drizzle's postgres-js session makes are wrapped: `unsafe` (every query) and
 * `begin` (every transaction); savepoints run on the transaction's own client.
 */
function scopedClient(base: Sql, scope: Scope): Sql {
  const unsafe = (
    query: string,
    parameters?: postgres.ParameterOrJSON<never>[],
    options?: postgres.UnsafeQueryOptions
  ) => {
    // One round trip: BEGIN, the setting, the statement and COMMIT pipelined on a reserved
    // connection (a COMMIT after a failed statement ends the transaction as a ROLLBACK). Releasing
    // a connection that is not idle closes it (postgres.js), so a transaction a failure left open
    // can never reach another caller with this scope set.
    const run = async (values: boolean) => {
      const reserved = await base.reserve();
      try {
        const statement = reserved.unsafe(query, parameters, options);
        const replies = await Promise.all([
          reserved.unsafe("begin"),
          setScope(reserved, scope),
          values ? statement.values() : statement,
          reserved.unsafe("commit"),
        ]);
        return replies[2];
      } finally {
        reserved.release();
      }
    };
    // Drizzle awaits the query or calls `.values()` on it; both run it in the scoped transaction.
    return {
      values: async () => run(true),
      // oxlint-disable-next-line unicorn/no-thenable -- Drizzle awaits what `unsafe` returns: this stands in for postgres.js's lazy query
      then: async <A, B>(
        onFulfilled?: (value: unknown) => A | PromiseLike<A>,
        onRejected?: (reason: unknown) => B | PromiseLike<B>
      ) =>
        // oxlint-disable-next-line promise/prefer-catch -- the thenable protocol hands both callbacks to one `then`
        run(false).then(onFulfilled, onRejected),
    };
  };
  // postgres.js: `begin(fn)` or `begin(options, fn)`.
  const begin = async (
    first: string | TransactionBody,
    second?: TransactionBody
  ) => {
    const body = typeof first === "string" ? second : first;
    if (body === undefined) throw new TypeError("begin needs a callback");
    const scopedBody = async (tx: postgres.TransactionSql) => {
      // Sent at once and not awaited before the body: the transaction's connection runs its
      // statements in order, so the setting precedes the body's first statement without a round
      // trip of its own. A failed setting aborts the transaction, so the body fails too; it is
      // still awaited, so its own error is never lost.
      const setting = setScope(tx, scope);
      setting.catch(() => {});
      const result = await body(tx);
      await setting;
      return result;
    };
    return typeof first === "string"
      ? base.begin(first, scopedBody)
      : base.begin(scopedBody);
  };
  const scoped = new Proxy(base, {
    get(target, property, receiver) {
      if (property === "unsafe") return unsafe;
      if (property === "begin") return begin;
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
  scopeOf.set(scoped, { base, scope });
  return scoped;
}

function scopeOfHandle(exec: DbExec): Scope | undefined {
  return isTransaction(exec) ? undefined : scopeOf.get(exec.$client)?.scope;
}

/** True for a handle `organizationScopedDb` made (scoped to some organization). */
export function isOrganizationScoped(exec: DbExec): boolean {
  return scopeOfHandle(exec)?.organizationId !== undefined;
}

/** The handle over `db`'s base client with `patch` applied to `db`'s own scope, cached. */
function scopedDb(db: Db, patch: Scope): Db {
  const own = scopeOf.get(db.$client);
  const client = own?.base ?? db.$client;
  const scope: Scope = { ...own?.scope, ...patch };
  const key = `${scope.role ?? ""}/${scope.organizationId ?? ""}`;
  let perClient = handles.get(client);
  if (perClient === undefined) {
    perClient = new Map();
    handles.set(client, perClient);
  }
  const cached = perClient.get(key);
  if (cached !== undefined) return cached;
  const scoped = drizzle(scopedClient(client, scope), { schema });
  if (perClient.size >= MAX_HANDLES_PER_CLIENT) {
    const oldest = perClient.keys().next();
    if (oldest.done !== true) perClient.delete(oldest.value);
  }
  perClient.set(key, scoped);
  return scoped;
}

/**
 * The pool handle `db`, scoped to one organization: every statement and transaction run on it sets
 * `watchdog.org_id` first, so the row-level security policies on every Case-scoped table show that
 * organization's rows only. A handle without a scope sees none of them (fail closed). Scoping a
 * scoped handle again replaces the organization (it wraps the same base client) and keeps its
 * role. Handles are cached per client and scope.
 */
export function organizationScopedDb(
  db: Db,
  organizationId: OrganizationId
): Db {
  return scopedDb(db, { organizationId });
}

/**
 * The pool handle `db`, running as the worker role (`WORKER_ROLE`, #720): every statement and
 * transaction run on it switches to the role first (`set_config('role', ...)`, transaction-local,
 * so the pooled connection is its login role again after it) and then writes no Graph table. For
 * an API-key request in the web process; the worker itself logs in as the role. Keeps `db`'s
 * organization, and a later `organizationScopedDb` keeps the role.
 */
export function workerRoleDb(db: Db): Db {
  return scopedDb(db, { role: WORKER_ROLE });
}

/**
 * Switch the rest of the transaction `tx` to the worker role: `workerRoleDb` for a transaction
 * handle (a test's `Db.layerOf(tx)`). Transaction-local, like the organization.
 */
export async function setWorkerRole(tx: DbTx): Promise<void> {
  await tx.execute(sql`select set_config('role', ${WORKER_ROLE}, true)`);
}
