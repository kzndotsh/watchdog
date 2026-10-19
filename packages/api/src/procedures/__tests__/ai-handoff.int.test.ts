import { createRouterClient, ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";

import { replayActivityEffect } from "@watchdog/core/activity";
import { runDomain } from "@watchdog/core/infra";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedOrganizationMember,
  testDb,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import type { ApiContext } from "../../context";
import { router } from "../../router";

const OWNER = "handoff-owner";
const ADMIN = "handoff-admin";
const MEMBER = "handoff-member";
const OUTSIDER = "handoff-outsider";
const OTHER_ORG_USER = "handoff-other-org";
const SECRET_TEXT = "SECRET-DOSSIER-TEXT-must-never-be-logged";

function clientFor(userId: string, organizationId = TEST_ORGANIZATION_ID) {
  return createRouterClient(router, {
    context: {
      headers: new Headers(),
      actor: { userId, email: null, name: userId, organizationId },
      credential: { kind: "session" },
    } satisfies ApiContext,
  });
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ORPCError) return error.code;
    throw error;
  }
  return "SUCCEEDED";
}

async function handoffEntries(caseId: string) {
  const replay = await runDomain(
    replayActivityEffect({
      organizationId: TEST_ORGANIZATION_ID,
      after: { xid: "0", id: 0 },
    })
  );
  if (replay.kind !== "entries") throw new TypeError("expected entries");
  return replay.entries.filter(
    (entry) => entry.caseId === caseId && entry.kind === "handoff"
  );
}

async function seedOrganization() {
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
  await seedOrganizationMember(testDb, {
    organizationId: TEST_OTHER_ORGANIZATION_ID,
    userId: OTHER_ORG_USER,
    role: "owner",
  });
}

describe("organization settings", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganization();
  });

  it("defaults the external AI handoff to on", async () => {
    expect(await clientFor(MEMBER).organization.getSettings()).toEqual({
      externalAiHandoff: true,
    });
  });

  it("lets an owner and an admin turn the handoff off and on", async () => {
    expect(
      await clientFor(OWNER).organization.updateSettings({
        externalAiHandoff: false,
      })
    ).toEqual({ externalAiHandoff: false });
    expect(await clientFor(MEMBER).organization.getSettings()).toEqual({
      externalAiHandoff: false,
    });
    expect(
      await clientFor(ADMIN).organization.updateSettings({
        externalAiHandoff: true,
      })
    ).toEqual({ externalAiHandoff: true });
  });

  it("refuses a member, and a user who is not in the organization", async () => {
    expect(
      await codeOf(async () =>
        clientFor(MEMBER).organization.updateSettings({
          externalAiHandoff: false,
        })
      )
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(async () =>
        clientFor(OUTSIDER).organization.updateSettings({
          externalAiHandoff: false,
        })
      )
    ).toBe("FORBIDDEN");
    expect(await clientFor(OWNER).organization.getSettings()).toEqual({
      externalAiHandoff: true,
    });
  });

  it("keeps each organization's setting to itself", async () => {
    await clientFor(
      OTHER_ORG_USER,
      TEST_OTHER_ORGANIZATION_ID
    ).organization.updateSettings({ externalAiHandoff: false });
    expect(await clientFor(OWNER).organization.getSettings()).toEqual({
      externalAiHandoff: true,
    });
  });
});

describe("entities.recordAiHandoff", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganization();
  });

  it("appends one entry naming the actor, the Entity and the destination, never the text", async () => {
    const cased = await seedCase(testDb);
    const entity = await seedEntity(testDb, cased.id, {
      id: testId(20),
      name: "Ada Lovelace",
      slug: "ada-lovelace",
      summary: SECRET_TEXT,
      notes: SECRET_TEXT,
    });

    await clientFor(MEMBER).entities.recordAiHandoff({
      caseId: cased.id,
      slug: "ada-lovelace",
      destination: "claude",
    });

    const entries = await handoffEntries(cased.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "handoff",
      action: "opened",
      subjectId: entity.id,
      label: "Ada Lovelace",
      toValue: "claude",
      actorId: MEMBER,
    });
    expect(JSON.stringify(entries)).not.toContain(SECRET_TEXT);
  });

  it("shows in Recent activity with the actor and the destination", async () => {
    const cased = await seedCase(testDb);
    await seedEntity(testDb, cased.id, {
      id: testId(20),
      name: "Ada Lovelace",
      slug: "ada-lovelace",
    });
    await clientFor(OWNER).entities.recordAiHandoff({
      caseId: cased.id,
      slug: "ada-lovelace",
      destination: "chatgpt",
    });

    const feed = await clientFor(OWNER).activity.listRecent({
      caseId: cased.id,
    });

    const item = feed.find((row) => row.kind === "handoff");
    expect(item).toMatchObject({
      kind: "handoff",
      action: "Sent to ChatGPT",
      label: "Ada Lovelace",
    });
    expect(item?.actor).toBeDefined();
  });

  it("refuses and records nothing when the organization turned the handoff off", async () => {
    const cased = await seedCase(testDb);
    await seedEntity(testDb, cased.id, {
      id: testId(20),
      name: "Ada Lovelace",
      slug: "ada-lovelace",
    });
    await clientFor(ADMIN).organization.updateSettings({
      externalAiHandoff: false,
    });

    const code = await codeOf(async () =>
      clientFor(MEMBER).entities.recordAiHandoff({
        caseId: cased.id,
        slug: "ada-lovelace",
        destination: "claude",
      })
    );

    expect(code).toBe("FORBIDDEN");
    expect(await handoffEntries(cased.id)).toEqual([]);
  });

  it("answers not found for an Entity that does not exist, and records nothing", async () => {
    const cased = await seedCase(testDb);

    const code = await codeOf(async () =>
      clientFor(MEMBER).entities.recordAiHandoff({
        caseId: cased.id,
        slug: "nobody",
        destination: "claude",
      })
    );

    expect(code).toBe("NOT_FOUND");
    expect(await handoffEntries(cased.id)).toEqual([]);
  });
});
