import { AsyncLocalStorage } from "node:async_hooks";

import type { ApiCredential, ProcedureScope } from "@watchdog/schemas/shared";

/**
 * Set while an API-key request runs: `runApp` reads it and runs the Effect as the worker role
 * (`inWorkerRole`, #720), which may write no Graph table. A request is the scope (AsyncLocalStorage),
 * so the 100-odd `runApp` calls of the procedures need no argument and a new procedure is covered
 * without a change.
 */
const workerRoleRequest = new AsyncLocalStorage<true>();

/**
 * Whether a request runs as the worker role: an API key does, except on a procedure or route that
 * declares `graph:write`, the agent Graph-write path (the `graph.write` escape hatch, the child
 * writes and their custody, entities, tasks), which keeps the application role and records an
 * `agent_write` changeset. A session never does: a person's Dossier edit and Triage Accept write
 * the Graph.
 */
export function runsAsWorkerRole(
  credential: ApiCredential,
  scope: ProcedureScope | undefined
): boolean {
  return credential.kind === "apiKey" && scope !== "graph:write";
}

/**
 * Run `body` (the rest of a procedure, or a file route's handler) in the role its caller gets:
 * the worker role for an API key (`runsAsWorkerRole`), unchanged otherwise.
 */
export function runAsCaller<T>(
  credential: ApiCredential,
  scope: ProcedureScope | undefined,
  body: () => T
): T {
  return runsAsWorkerRole(credential, scope)
    ? workerRoleRequest.run(true, body)
    : body();
}

/** True inside `runAsCaller` for a request that runs as the worker role. */
export function inWorkerRoleRequest(): boolean {
  return workerRoleRequest.getStore() === true;
}
