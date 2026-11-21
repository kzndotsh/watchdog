import { createRouterClient } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createEntityEffect } from "@watchdog/core/graph";
import {
  trimmedCaseIdSchema,
  type ApiCredential,
  type OrganizationId,
} from "@watchdog/domain/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  testApiKey,
} from "@watchdog/domain/schemas/testing";
import { TEST_ACTOR_ID } from "@watchdog/domain/test-kit";
import {
  listAllGraphHistory,
  resetTestDb,
  seedCase,
  seedOrganizationMember,
  testDb,
} from "@watchdog/test-db";

import { runsAsWorkerRole } from "../caller-role";
import type { ApiContext } from "../context";
import { authed } from "../os";
import { runApp } from "../runtime";

/**
 * Issue #720: an API-key request runs as the worker role, which writes no Graph table, unless its
 * procedure declares `graph:write` (the agent Graph-write path); a session never does. The probe
 * procedures below each try the same Graph write (an Entity create, as a Dossier edit would), so
 * the role the request ran as is what decides whether it lands.
 */
const input = z.object({
  caseId: trimmedCaseIdSchema,
  slug: z.string().max(64),
});

function createEntity(
  { caseId, slug }: z.infer<typeof input>,
  organizationId: OrganizationId
) {
  return runApp(
    createEntityEffect({
      caseId,
      organizationId,
      kind: "person",
      name: slug,
      slug,
      actorId: TEST_ACTOR_ID,
    })
  );
}

const probes = {
  // Declares a scope other than graph:write, as reads, Collect and Proposals do.
  asReader: authed
    .meta({ scope: "cases:read" })
    .input(input)
    .handler(async ({ input: args, context }) =>
      createEntity(args, context.actor.organizationId)
    ),
  // Declares graph:write, as the escape hatch and the child writes do.
  asGraphWriter: authed
    .meta({ scope: "graph:write" })
    .input(input)
    .handler(async ({ input: args, context }) =>
      createEntity(args, context.actor.organizationId)
    ),
};

function clientFor(credential: ApiCredential) {
  return createRouterClient(probes, {
    context: {
      headers: new Headers(),
      actor: {
        userId: TEST_ACTOR_ID,
        email: null,
        name: credential.kind === "apiKey" ? "api-key:probe" : "Probe",
        organizationId: TEST_ORGANIZATION_ID,
      },
      credential,
    } satisfies ApiContext,
  });
}

const key = clientFor(testApiKey("key-720"));
const session = clientFor({ kind: "session" });

async function entitySlugs(): Promise<string[]> {
  return (await listAllGraphHistory())
    .filter((row) => row.kind === "entity" && row.op === "create")
    .map((row) => String((row.after as { slug?: unknown } | null)?.slug));
}

describe("the database role of a request (#720)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(testDb, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "owner",
    });
  });

  it("an API key on a procedure that is not graph:write cannot write the Graph", async () => {
    const cased = await seedCase(testDb);
    await expect(
      key.asReader({ caseId: cased.id, slug: "by-key" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(await entitySlugs()).toEqual([]);
  });

  it("an API key on a graph:write procedure keeps the application role (the agent write path)", async () => {
    const cased = await seedCase(testDb);
    await key.asGraphWriter({ caseId: cased.id, slug: "by-agent" });
    expect(await entitySlugs()).toEqual(["by-agent"]);
  });

  it("a session writes whatever the procedure declares", async () => {
    const cased = await seedCase(testDb);
    await session.asReader({ caseId: cased.id, slug: "by-person" });
    expect(await entitySlugs()).toEqual(["by-person"]);
  });

  it("decides by credential and declared scope", () => {
    const apiKey = testApiKey("key-720");
    expect(runsAsWorkerRole(apiKey, "cases:read")).toBe(true);
    expect(runsAsWorkerRole(apiKey, "evidence:write")).toBe(true);
    expect(runsAsWorkerRole(apiKey, "proposals:write")).toBe(true);
    expect(runsAsWorkerRole(apiKey, "graph:write")).toBe(false);
    expect(runsAsWorkerRole({ kind: "session" }, "cases:read")).toBe(false);
  });
});
