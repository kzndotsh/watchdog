import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { createRouterClient } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";

import type { ApiCredential } from "@watchdog/schemas/shared";
import {
  buildClaimCreateOp,
  buildIdentifierCreateOp,
  TEST_ORGANIZATION_ID,
  testApiKey,
} from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, seedEntity, testDb } from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

import type { ApiContext } from "../../context";
import { responsePlugins } from "../../response-plugins";
import { router } from "../../router";

/**
 * Proposal ingress through the API (#723): the typed op union is the request schema, so a
 * malformed op is refused when the Proposal is created, before core, and a well-formed one is
 * accepted in Triage. The request goes through the OpenAPI handler as an agent's would.
 */
function contextFor(credential: ApiCredential): ApiContext {
  return {
    headers: new Headers(),
    actor: {
      userId: TEST_ACTOR_ID,
      email: null,
      name: "Agent",
      organizationId: TEST_ORGANIZATION_ID,
    },
    credential,
  };
}

const agentKey = testApiKey("proposal-ingress-key");
const reviewer = createRouterClient(router, {
  context: contextFor({ kind: "session" }),
});

async function postProposal(caseId: string, patch: unknown[]) {
  const handler = new OpenAPIHandler(router, { plugins: responsePlugins() });
  const { response } = await handler.handle(
    new Request(`http://localhost/api/v1/cases/${caseId}/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch, summary: "from an agent" }),
    }),
    { prefix: "/api/v1", context: contextFor(agentKey) }
  );
  const body: unknown = await response?.json();
  return { status: response?.status, body };
}

async function pendingCount(caseId: string): Promise<number> {
  const page = await reviewer.proposals.listForCase({
    caseId,
    status: ["pending"],
  });
  return page.items.length;
}

describe("Proposal ingress through the API", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  const malformed: [name: string, op: (entityId: string) => unknown][] = [
    [
      "confidence in an op's data",
      (entityId) => ({
        ...buildClaimCreateOp(entityId, "observed", { id: testId(30) }),
        data: { entityId, text: "observed", confidence: "confirmed" },
      }),
    ],
    [
      "a kind the union does not have",
      (entityId) => ({
        kind: "claim.retract",
        id: testId(30),
        data: { entityId, text: "observed" },
      }),
    ],
    [
      "the old resource + op envelope",
      (entityId) => ({
        op: "create",
        resource: "claim",
        id: testId(30),
        data: { entityId, text: "observed" },
      }),
    ],
    [
      "a Connection from an Entity to itself",
      (entityId) => ({
        kind: "edge.create",
        id: testId(30),
        data: { fromId: entityId, toId: entityId, predicate: "associate_of" },
      }),
    ],
    [
      "an identifier of an unknown type",
      (entityId) => ({
        kind: "identifier.create",
        id: testId(30),
        data: { entityId, type: "telepathy", value: "x" },
      }),
    ],
  ];

  for (const [name, op] of malformed) {
    it(`refuses ${name} at creation, before any Proposal exists`, async () => {
      const cased = await seedCase(testDb);
      const entity = await seedEntity(testDb, cased.id, { id: testId(20) });

      const { status, body } = await postProposal(cased.id, [op(entity.id)]);

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: "BAD_REQUEST" });
      expect(await pendingCount(cased.id)).toBe(0);
    });
  }

  it("creates a Proposal from typed ops that Triage then accepts into the Graph", async () => {
    const cased = await seedCase(testDb);
    const entity = await seedEntity(testDb, cased.id, { id: testId(21) });
    const claim = buildClaimCreateOp(entity.id, "Agent claim", {
      id: testId(40),
    });
    const identifier = buildIdentifierCreateOp(
      entity.id,
      "email",
      "ada@mailhost.test",
      { id: testId(41) }
    );

    const { status, body } = await postProposal(cased.id, [claim, identifier]);

    expect(status).toBe(201);
    expect(body).toMatchObject({
      status: "pending",
      patch: [
        { kind: "claim.create", id: claim.id },
        { kind: "identifier.create", id: identifier.id },
      ],
    });
    const created = await reviewer.proposals.listForCase({
      caseId: cased.id,
      status: ["pending"],
    });
    const [proposal] = created.items;
    expect(proposal).toBeDefined();
    if (proposal === undefined) return;

    const accepted = await reviewer.proposals.accept({
      caseId: cased.id,
      proposalId: proposal.id,
      confidence: "unverified",
    });
    expect(accepted.status).toBe("accepted");
    const claims = await reviewer.claims.list({
      caseId: cased.id,
      entityId: entity.id,
    });
    expect(claims.items.map((row) => row.text)).toEqual(["Agent claim"]);
  });
});
