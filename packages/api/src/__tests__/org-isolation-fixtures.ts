import { createRouterClient, isProcedure } from "@orpc/server";

import type {
  ApiCredential,
  CaseId,
  OrganizationId,
} from "@watchdog/schemas/shared";

import type { ApiContext } from "../context";
import { router } from "../router";

/**
 * An in-process client for `router`, authenticated as a user of one organization: by session
 * (default) or as an API key (a `credential` of kind `apiKey`).
 */
export function clientFor(
  organizationId: OrganizationId,
  userId: string,
  credential: ApiCredential = { kind: "session" }
) {
  const context: ApiContext = {
    headers: new Headers(),
    actor: { userId, email: null, name: userId, organizationId },
    credential,
  };
  return createRouterClient(router, { context });
}

export type ApiClient = ReturnType<typeof clientFor>;

/** Ids the attacks refer to: organization A's rows and organization B's own case. */
export type IsolationIds = {
  caseA: CaseId;
  caseB: CaseId;
  /** The slug of A's Case: what a Case URL names. */
  caseSlugA: string;
  entityA: string;
  entityA2: string;
  entityB: string;
  claimA: string;
  identifierA: string;
  edgeA: string;
  eventA: string;
  questionA: string;
  taskA: string;
  evidenceA: string;
  jobA: string;
  proposalA: string;
  playbookRunA: string;
};

/** One attack: a label that starts with the procedure path, and the call. */
export type Attack = readonly [name: string, run: () => Promise<unknown>];

/** The router procedure an attack label targets: `claims.update(A claim)` is `claims.update`. */
export function procedureOf(attackName: string): string {
  return attackName.split(/[(+]/)[0] ?? attackName;
}

/** Every procedure path of an oRPC router (`cases.get`, `health`), found by walking it. */
export function procedurePaths(node: object, prefix = ""): string[] {
  if (isProcedure(node)) return [prefix];
  return Object.entries(node).flatMap(([key, child]) =>
    typeof child === "object" && child !== null
      ? procedurePaths(child, prefix === "" ? key : `${prefix}.${key}`)
      : []
  );
}

/** The scope a procedure declares through `.meta({ scope })` (or its builder), if any. */
export function declaredScope(node: object, path: string): unknown {
  let current: unknown = node;
  for (const key of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = Reflect.get(current, key);
  }
  return isProcedure(current) ? current["~orpc"].meta.scope : undefined;
}

/** Calls the procedure at `path` (`cases.get`) on a router client with `input`. */
export function callProcedure(
  client: object,
  path: string,
  input: unknown
): Promise<unknown> {
  let current: unknown = client;
  for (const key of path.split(".")) {
    if (typeof current !== "object" && typeof current !== "function") {
      throw new TypeError(`No procedure at ${path}`);
    }
    if (current === null) throw new TypeError(`No procedure at ${path}`);
    current = Reflect.get(current, key);
  }
  if (typeof current !== "function")
    throw new TypeError(`No procedure at ${path}`);
  return Promise.resolve(current(input));
}
