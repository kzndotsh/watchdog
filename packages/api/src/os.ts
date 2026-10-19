import { ORPCError, os } from "@orpc/server";
import { evlog } from "evlog/orpc";

import type { ApiActor, OrganizationId } from "@watchdog/schemas/shared";

import type { ApiContext } from "./context";
import { assertAgentChildWriteCustody } from "./custody";
import { apiErrorMap, withStableCode } from "./error-map";

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

/** Child Graph writes — agent (API key) callers need userOverride and cannot set confirmed. */
export const graphChildWrite = authed.use(({ context, next }, input) => {
  assertAgentChildWriteCustody(input, context.credential);
  return next();
});

/**
 * Owner-only operations that must never run on an API key (purge): the caller has to be a
 * signed-in user. Scoped keys (#298) will let an operator grant more; until then a key cannot
 * erase a Case whatever its owner's role.
 */
export const sessionAuthed = authed.use(({ context, next }) => {
  if (context.credential.kind === "apiKey") {
    throw new ORPCError("FORBIDDEN", {
      message: "This action needs a signed-in session, not an API key",
    });
  }
  return next();
});
