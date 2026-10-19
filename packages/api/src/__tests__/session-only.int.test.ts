import { createRouterClient, ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";

import { TEST_ORGANIZATION_ID, testApiKey } from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedOrganizationMember,
  testDb,
} from "@watchdog/test-db";

import type { ApiContext } from "../context";
import { router } from "../router";

/**
 * Destructive and administrative actions need a signed-in session (#369). The key below holds
 * every scope and belongs to an owner, so only the credential kind can be what refuses it.
 */
const OWNER = "session-only-owner";
const ADMIN = "session-only-admin";
const MEMBER = "session-only-member";

function clientFor(
  userId: string,
  credential: ApiContext["credential"] = { kind: "session" }
) {
  return createRouterClient(router, {
    context: {
      headers: new Headers(),
      actor: {
        userId,
        email: null,
        name: userId,
        organizationId: TEST_ORGANIZATION_ID,
      },
      credential,
    } satisfies ApiContext,
  });
}

async function errorOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

async function expectForbidden(run: () => Promise<unknown>): Promise<void> {
  const error = await errorOf(run);
  expect(error).toBeInstanceOf(ORPCError);
  expect(error).toMatchObject({
    code: "FORBIDDEN",
    data: { code: "forbidden" },
  });
}

const key = clientFor(OWNER, testApiKey("session-only-key"));
const owner = clientFor(OWNER);

describe("session-only actions refuse an API key that holds every scope", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(testDb, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: OWNER,
      role: "owner",
    });
    await seedOrganizationMember(testDb, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: ADMIN,
      role: "admin",
    });
    await seedOrganizationMember(testDb, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: MEMBER,
      role: "member",
    });
  });

  it("cases.delete and cases.restore", async () => {
    const cased = await seedCase(testDb);
    await expectForbidden(async () => key.cases.delete({ caseId: cased.id }));
    expect((await owner.cases.list()).map((row) => row.id)).toEqual([cased.id]);

    await owner.cases.delete({ caseId: cased.id });
    await expectForbidden(async () => key.cases.restore({ caseId: cased.id }));
    expect(
      (await owner.cases.listDeleted({})).items.map((row) => row.id)
    ).toEqual([cased.id]);
    await owner.cases.restore({ caseId: cased.id });
  });

  it("credentials.put and credentials.delete, while credentials.list stays open", async () => {
    await owner.credentials.put({ name: "SESSION_ONLY_KEY", secret: "sk-1" });
    await expectForbidden(async () =>
      key.credentials.put({ name: "SESSION_ONLY_KEY", secret: "sk-2" })
    );
    await expectForbidden(async () =>
      key.credentials.delete({ name: "SESSION_ONLY_KEY" })
    );
    const slots = await key.credentials.list();
    expect(
      slots.find((slot) => slot.name === "SESSION_ONLY_KEY")?.configured
    ).toBe(true);
    await owner.credentials.delete({ name: "SESSION_ONLY_KEY" });
  });

  it("organization.updateSettings", async () => {
    await expectForbidden(async () =>
      key.organization.updateSettings({ externalAiHandoff: false })
    );
    expect(await key.organization.getSettings()).toEqual(
      await owner.organization.getSettings()
    );
  });

  it("cases.update when it changes the egress switch, while other fields keep graph:write", async () => {
    const cased = await seedCase(testDb);
    await expectForbidden(async () =>
      key.cases.update({ caseId: cased.id, allowThirdPartyEgress: true })
    );
    await expectForbidden(async () =>
      key.cases.update({
        caseId: cased.id,
        name: "Renamed",
        allowThirdPartyEgress: false,
      })
    );
    const unchanged = await owner.cases.get({ caseId: cased.id });
    expect(unchanged.allowThirdPartyEgress).toBe(false);
    expect(unchanged.name).toBe(cased.name);

    const edited = await key.cases.update({
      caseId: cased.id,
      description: "Edited by a key",
    });
    expect(edited.description).toBe("Edited by a key");
    await expect(
      clientFor(OWNER, testApiKey("read-only", ["cases:read"])).cases.update({
        caseId: cased.id,
        description: "No scope",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { code: "insufficient_scope" },
    });
  });
});

describe("the Case egress switch needs an owner or admin session", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(testDb, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: OWNER,
      role: "owner",
    });
    await seedOrganizationMember(testDb, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: ADMIN,
      role: "admin",
    });
    await seedOrganizationMember(testDb, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: MEMBER,
      role: "member",
    });
  });

  it("refuses a member session, and lets an owner or admin flip it", async () => {
    const cased = await seedCase(testDb);
    const member = clientFor(MEMBER);
    await expectForbidden(async () =>
      member.cases.update({ caseId: cased.id, allowThirdPartyEgress: true })
    );
    expect(
      (await owner.cases.get({ caseId: cased.id })).allowThirdPartyEgress
    ).toBe(false);

    const byOwner = await owner.cases.update({
      caseId: cased.id,
      allowThirdPartyEgress: true,
    });
    expect(byOwner.allowThirdPartyEgress).toBe(true);
    const byAdmin = await clientFor(ADMIN).cases.update({
      caseId: cased.id,
      allowThirdPartyEgress: false,
    });
    expect(byAdmin.allowThirdPartyEgress).toBe(false);
  });

  it("still lets a member edit the other Case fields", async () => {
    const cased = await seedCase(testDb);
    const edited = await clientFor(MEMBER).cases.update({
      caseId: cased.id,
      description: "Member edit",
    });
    expect(edited.description).toBe("Member edit");
  });
});
