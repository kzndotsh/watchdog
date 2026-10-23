import { ORPCError, os } from "@orpc/server";
import { evlog } from "evlog/orpc";

import type {
  ApiActor,
  OrganizationId,
  ProcedureScope,
} from "@watchdog/schemas/shared";

import type { ApiContext } from "./context";
import { assertAgentChildWriteCustody } from "./custody";
import { apiErrorMap, withStableCode } from "./error-map";
import { setRetryAfter } from "./retry-after";
import { assertScope, sessionRequiredError } from "./scope";

const ID_KEYS = [
  ["caseId", "case"],
  ["jobId", "job"],
  ["proposalId", "proposal"],
  ["evidenceId", "evidence"],
  ["entityId", "entity"],
  ["capabilityId", "cap"],
  ["playbookId", "playbook"],
  ["playbookRunId", "playbook"],
] as const;

function pickInputIds(input: unknown): Record<string, unknown> | null {
  if (input === null || typeof input !== "object") return null;
  const fields: Record<string, unknown> = {};
  for (const [key, group] of ID_KEYS) {
    const value: unknown = Reflect.get(input, key);
    if (typeof value !== "string") continue;
    const prev = fields[group];
    fields[group] =
      prev !== null && typeof prev === "object"
        ? { ...prev, [key]: value }
        : { [key]: value };
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

/**
 * What a procedure declares about who may call it (`.meta({ scope })`). `authed` procedures
 * declare the API key scope they need, or inherit `"session"` from `sessionAuthed`; `pub`
 * procedures are `"public"`. Sessions pass every scope; the middleware in `authed` enforces it for
 * API keys only, and a key reaching a procedure that declares none is refused (fail closed).
 */
export type ApiMeta = { scope?: ProcedureScope };

const base = os
  .$context<ApiContext>()
  .$meta<ApiMeta>({})
  .errors(apiErrorMap)
  .use(evlog())
  // Wraps input validation too (it runs after the middlewares declared here).
  .use(async ({ context, next }) => {
    try {
      return await next();
    } catch (error) {
      const stable = withStableCode(error);
      setRetryAfter(context.resHeaders, stable);
      throw stable;
    }
  })
  .use(({ context, next }, input) => {
    const fields = pickInputIds(input);
    if (fields && context.log) {
      context.log.set(fields);
    }
    return next();
  });

export const pub = base.meta({ scope: "public" });

const authenticated = base.use(({ context, next }) => {
  const { actor, credential } = context;
  if (!actor || !credential) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const organizationId = actor.organizationId;
  if (!organizationId) {
    throw new ORPCError("FORBIDDEN");
  }
  return next({
    context: {
      actor: {
        ...actor,
        organizationId,
      } satisfies ApiActor & { organizationId: OrganizationId },
      credential,
    },
  });
});

/**
 * Authenticated procedures. Declare the scope an API key needs with `.meta({ scope })`; this
 * middleware checks it for keys before input validation and lets sessions through.
 */
export const authed = authenticated.use(({ context, procedure, next }) => {
  const { credential } = context;
  if (credential.kind === "session") return next();
  const scope = procedure["~orpc"].meta.scope;
  if (scope === undefined || scope === "public") {
    // A procedure that forgot to declare its scope is a defect, never an open door.
    throw new Error("API procedure declares no key scope");
  }
  if (scope === "session") {
    throw sessionRequiredError();
  }
  assertScope(credential, scope);
  return next();
});

/** Child Graph writes need `graph:write`; agent (API key) callers also need userOverride and cannot set confirmed. */
export const graphChildWrite = authed
  .meta({ scope: "graph:write" })
  .use(({ context, next }, input) => {
    assertAgentChildWriteCustody(input, context.credential);
    return next();
  });

/**
 * Operations that must never run on an API key: the caller has to be a signed-in user. Purge,
 * Case delete and restore (a key cannot remove or bring back a Case whatever its owner's role),
 * credential writes, organization settings and Triage Accept / reject (a person decides what
 * enters the Graph). Declares `scope: "session"`, which `authed` enforces.
 */
export const sessionAuthed = authed.meta({ scope: "session" });
