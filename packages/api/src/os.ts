import { ORPCError, os } from "@orpc/server";
import { evlog } from "evlog/orpc";

import type {
  ApiActor,
  ApiAuthMethod,
  OrganizationId,
} from "@watchdog/schemas/shared";

import type { ApiContext } from "./context";
import { assertAgentChildWriteCustody } from "./custody";
import { apiErrorMap, withStableCode } from "./error-map";

function apiKeyFromHeaders(headers: Headers): string | null {
  const authHeader = headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return headers.get("x-api-key");
}

/** Infer auth method when context omits it (in-process clients, tests). */
export function resolveAuthMethod(context: ApiContext): ApiAuthMethod {
  if (context.authMethod === "apiKey" || context.authMethod === "session") {
    return context.authMethod;
  }
  return apiKeyFromHeaders(context.headers) ? "apiKey" : "session";
}

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

const base = os
  .$context<ApiContext>()
  .errors(apiErrorMap)
  .use(evlog())
  // Wraps input validation too (it runs after the middlewares declared here).
  .use(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      throw withStableCode(error);
    }
  })
  .use(({ context, next }, input) => {
    const fields = pickInputIds(input);
    if (fields && context.log) {
      context.log.set(fields);
    }
    return next();
  });

export const pub = base;

export const authed = base.use(({ context, next }) => {
  if (!context.actor) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const organizationId = context.actor.organizationId;
  if (!organizationId) {
    throw new ORPCError("FORBIDDEN");
  }
  const authMethod = resolveAuthMethod(context);
  return next({
    context: {
      actor: {
        ...context.actor,
        organizationId,
      } satisfies ApiActor & { organizationId: OrganizationId },
      authMethod,
    },
  });
});

/** Child Graph writes — agent (API key) callers need userOverride and cannot set confirmed. */
export const graphChildWrite = authed.use(({ context, next }, input) => {
  assertAgentChildWriteCustody(input, context.authMethod);
  return next();
});

/**
 * Operations that must never run on an API key: the caller has to be a signed-in user. Purge
 * (a key cannot erase a Case whatever its owner's role) and Triage Accept / reject (a person
 * decides what enters the Graph). Scoped keys (#298) will let an operator grant more.
 */
export const sessionAuthed = authed.use(({ context, next }) => {
  if (context.authMethod === "apiKey") {
    throw new ORPCError("FORBIDDEN", {
      message: "This action needs a signed-in session, not an API key",
    });
  }
  return next();
});
