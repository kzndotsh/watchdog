import { randomUUID } from "node:crypto";

import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { createRouterClient, ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";

import type { ApiCredential, OrganizationId } from "@watchdog/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
  testApiKey,
} from "@watchdog/schemas/testing";
import {
  forceJobStatus,
  resetTestDb,
  seedApiKey,
  seedCase,
  seedEvidence,
  seedJob,
  seedJobStarts,
  seedOrganizationMember,
  setUserRole,
  testDb,
} from "@watchdog/test-db";

import type { ApiContext } from "../../context";
import { responsePlugins } from "../../response-plugins";
import { router } from "../../router";

/**
 * Every start below is refused (its count is seeded to the limit, or the limit is 0), so no Job
 * is created and nothing reaches the queue: the admitted side of each path, and the exact
 * concurrency, are tested in core (`start-limits*.int.test.ts`).
 */
const OWNER = "wd480-owner";
const ADMIN = "wd480-admin";
const MEMBER = "wd480-member";
const INSTANCE_ADMIN = "wd480-instance-admin";
const OTHER_ORG_OWNER = "wd480-other-owner";

function contextFor(
  userId: string,
  credential: ApiCredential = { kind: "session" },
  organizationId: OrganizationId = TEST_ORGANIZATION_ID
): ApiContext {
  return {
    headers: new Headers(),
    actor: { userId, email: null, name: userId, organizationId },
    credential,
  };
}

function clientFor(
  userId: string,
  credential?: ApiCredential,
  organizationId?: OrganizationId
) {
  return createRouterClient(router, {
    context: contextFor(userId, credential, organizationId),
  });
}

const owner = clientFor(OWNER);
const otherOwner = clientFor(
  OTHER_ORG_OWNER,
  undefined,
  TEST_OTHER_ORGANIZATION_ID
);

async function keyOf(organizationId: OrganizationId, ownerId: string) {
  const id = `wd480-${randomUUID()}`;
  await seedApiKey(testDb, {
    id,
    ownerId,
    metadata: JSON.stringify({ organizationId }),
  });
  return id;
}

async function errorOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

function dnsInput(caseId: string) {
  return {
    caseId,
    capabilityId: "network.dns.lookup",
    input: { host: "mailhost.test" },
  } as const;
}

function expectRefused(
  error: unknown,
  data: { scope: "organization" | "key"; limit: number }
) {
  expect(error).toBeInstanceOf(ORPCError);
  expect(error).toMatchObject({
    code: "TOO_MANY_REQUESTS",
    status: 429,
    defined: true,
    data: { code: "job_start_limited", windowSeconds: 3600, ...data },
  });
  const retryAfter =
    error instanceof ORPCError && typeof error.data === "object"
      ? Reflect.get(error.data ?? {}, "retryAfterSeconds")
      : undefined;
  expect(retryAfter).toBeGreaterThanOrEqual(1);
  expect(retryAfter).toBeLessThanOrEqual(3600);
}

describe("Job start limits through the API", () => {
  beforeEach(async () => {
    await resetTestDb();
    const members: [OrganizationId, string, string][] = [
      [TEST_ORGANIZATION_ID, OWNER, "owner"],
      [TEST_ORGANIZATION_ID, ADMIN, "admin"],
      [TEST_ORGANIZATION_ID, MEMBER, "member"],
      [TEST_ORGANIZATION_ID, INSTANCE_ADMIN, "member"],
      [TEST_OTHER_ORGANIZATION_ID, OTHER_ORG_OWNER, "owner"],
    ];
    for (const [organizationId, userId, role] of members) {
      // oxlint-disable-next-line no-await-in-loop -- a few seeds, one after the other
      await seedOrganizationMember(testDb, { organizationId, userId, role });
    }
    await setUserRole(testDb, INSTANCE_ADMIN, "admin");
  });

  it("refuses a start over the organization's limit with the stable code, 429 and the retry time", async () => {
    const cased = await seedCase(testDb);
    const { windowSeconds } = await owner.organization.setJobStartLimit({
      maxStarts: 2,
    });
    await seedJobStarts(testDb, {
      scope: "organization",
      subjectId: TEST_ORGANIZATION_ID,
      windowSeconds,
      count: 2,
    });

    const error = await errorOf(async () =>
      owner.jobs.start(dnsInput(cased.id))
    );

    expectRefused(error, { scope: "organization", limit: 2 });
    expect(
      (await owner.jobs.listForCase({ caseId: cased.id, limit: 50 })).items
    ).toHaveLength(0);
    expect(
      (await owner.organization.getJobStartLimits()).organization
    ).toMatchObject({ used: 2, limit: 2, source: "override" });
  });

  it("answers HTTP 429 with a Retry-After header that matches the error", async () => {
    const cased = await seedCase(testDb);
    await owner.organization.setJobStartLimit({ maxStarts: 0 });
    const handler = new OpenAPIHandler(router, {
      plugins: responsePlugins(),
    });

    const { matched, response } = await handler.handle(
      new Request(`http://localhost/api/v1/cases/${cased.id}/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          capabilityId: "network.dns.lookup",
          input: { host: "mailhost.test" },
        }),
      }),
      { prefix: "/api/v1", context: contextFor(OWNER) }
    );

    expect(matched).toBe(true);
    expect(response?.status).toBe(429);
    const body: unknown = await response?.json();
    expect(body).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      data: { code: "job_start_limited", scope: "organization", limit: 0 },
    });
    const header = response?.headers.get("retry-after") ?? "";
    expect(header).toMatch(/^[1-9]\d*$/);
    expect(body).toMatchObject({ data: { retryAfterSeconds: Number(header) } });
  });

  it("limits a key apart from its organization, and a refused key start gives the organization's count back", async () => {
    const cased = await seedCase(testDb);
    const limited = await keyOf(TEST_ORGANIZATION_ID, OWNER);
    const other = await keyOf(TEST_ORGANIZATION_ID, OWNER);
    const { windowSeconds } = await owner.organization.setJobStartLimit({
      keyId: limited,
      maxStarts: 1,
    });
    await seedJobStarts(testDb, {
      scope: "key",
      subjectId: limited,
      windowSeconds,
      count: 1,
    });

    const limitedClient = clientFor(OWNER, testApiKey(limited));
    const error = await errorOf(async () =>
      limitedClient.jobs.start(dnsInput(cased.id))
    );

    expectRefused(error, { scope: "key", limit: 1 });
    const seen = await limitedClient.organization.getJobStartLimits();
    expect(seen.key).toMatchObject({ limit: 1, used: 1, source: "override" });
    // The organization took the start first, then the key refused it: the count went back.
    expect(seen.organization).toMatchObject({ used: 0, source: "default" });
    expect(seen.keyOverrides).toEqual([{ keyId: limited, limit: 1 }]);
    // Another key of the organization has its own count and the default limit.
    const otherSeen = await clientFor(
      OWNER,
      testApiKey(other)
    ).organization.getJobStartLimits();
    expect(otherSeen.key).toMatchObject({ used: 0, source: "default" });
    expect((await owner.organization.getJobStartLimits()).key).toBeNull();
  });

  describe("every start path is refused", () => {
    beforeEach(async () => {
      await owner.organization.setJobStartLimit({ maxStarts: 0 });
    });

    it("a Playbook run", async () => {
      const cased = await seedCase(testDb);
      const error = await errorOf(async () =>
        owner.jobs.startPlaybook({
          caseId: cased.id,
          playbookId: "host-footprint",
          seed: { host: "mailhost.test" },
        })
      );
      expectRefused(error, { scope: "organization", limit: 0 });
    });

    it("a retry", async () => {
      const cased = await seedCase(testDb);
      const job = await seedJob(testDb, cased.id);
      await forceJobStatus(testDb, job.id, "failed");
      const error = await errorOf(async () =>
        owner.jobs.retry({ caseId: cased.id, jobId: job.id })
      );
      expectRefused(error, { scope: "organization", limit: 0 });
    });

    it("an Evidence verb", async () => {
      const cased = await seedCase(testDb);
      const evidence = await seedEvidence(testDb, cased.id, { kind: "file" });
      const error = await errorOf(async () =>
        owner.evidence.process({ caseId: cased.id, evidenceId: evidence.id })
      );
      expectRefused(error, { scope: "organization", limit: 0 });
    });
  });

  it("keeps counters and overrides inside their organization", async () => {
    const mine = await seedCase(testDb);
    const theirs = await seedCase(testDb, {
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });
    const { windowSeconds } = await owner.organization.setJobStartLimit({
      maxStarts: 1,
    });
    await seedJobStarts(testDb, {
      scope: "organization",
      subjectId: TEST_ORGANIZATION_ID,
      windowSeconds,
      count: 1,
    });
    // The other organization sets a different limit of its own.
    await otherOwner.organization.setJobStartLimit({ maxStarts: 0 });

    expectRefused(
      await errorOf(async () => owner.jobs.start(dnsInput(mine.id))),
      { scope: "organization", limit: 1 }
    );
    expectRefused(
      await errorOf(async () => otherOwner.jobs.start(dnsInput(theirs.id))),
      { scope: "organization", limit: 0 }
    );
    expect(await owner.organization.getJobStartLimits()).toMatchObject({
      organization: { used: 1, limit: 1 },
    });
    expect(await otherOwner.organization.getJobStartLimits()).toMatchObject({
      organization: { used: 0, limit: 0 },
    });
  });

  describe("who may set a limit", () => {
    it("a plain member may not", async () => {
      const error = await errorOf(async () =>
        clientFor(MEMBER).organization.setJobStartLimit({ maxStarts: 5 })
      );
      expect(error).toMatchObject({
        code: "FORBIDDEN",
        data: { code: "forbidden" },
      });
    });

    it("an API key may not, whatever its scopes (session only)", async () => {
      const key = await keyOf(TEST_ORGANIZATION_ID, OWNER);
      const error = await errorOf(async () =>
        clientFor(OWNER, testApiKey(key)).organization.setJobStartLimit({
          maxStarts: 5,
        })
      );
      expect(error).toMatchObject({ code: "FORBIDDEN" });
      expect(
        (await owner.organization.getJobStartLimits()).organization.source
      ).toBe("default");
    });

    it("an owner or admin lowers the organization's limit and sets a key's", async () => {
      const key = await keyOf(TEST_ORGANIZATION_ID, ADMIN);
      const admin = clientFor(ADMIN);

      const lowered = await admin.organization.setJobStartLimit({
        maxStarts: 10,
      });
      expect(lowered.organization).toMatchObject({
        limit: 10,
        source: "override",
      });
      const keyed = await admin.organization.setJobStartLimit({
        keyId: key,
        maxStarts: 3,
      });
      expect(keyed.keyOverrides).toEqual([{ keyId: key, limit: 3 }]);

      const cleared = await admin.organization.setJobStartLimit({
        maxStarts: null,
      });
      expect(cleared.organization.source).toBe("default");
      const clearedKey = await admin.organization.setJobStartLimit({
        keyId: key,
        maxStarts: null,
      });
      expect(clearedKey.keyOverrides).toEqual([]);
    });

    it("only an instance admin raises the organization's limit above the instance default", async () => {
      const above =
        (await owner.organization.getJobStartLimits()).organization
          .defaultLimit + 1;
      const refused = await errorOf(async () =>
        clientFor(ADMIN).organization.setJobStartLimit({ maxStarts: above })
      );
      expect(refused).toMatchObject({
        code: "FORBIDDEN",
        data: { code: "forbidden" },
      });

      const raised = await clientFor(
        INSTANCE_ADMIN
      ).organization.setJobStartLimit({ maxStarts: above });
      expect(raised.organization).toMatchObject({
        limit: above,
        source: "override",
      });
    });

    it("a key of another organization is not found, and so is a missing one", async () => {
      const foreign = await keyOf(TEST_OTHER_ORGANIZATION_ID, OTHER_ORG_OWNER);
      for (const keyId of [foreign, "no-such-key"]) {
        // oxlint-disable-next-line no-await-in-loop -- two calls, one after the other
        const error = await errorOf(async () =>
          owner.organization.setJobStartLimit({ keyId, maxStarts: 1 })
        );
        expect(error).toMatchObject({
          code: "NOT_FOUND",
          data: { code: "not_found", entity: "API key" },
        });
      }
      expect(
        (await otherOwner.organization.getJobStartLimits()).keyOverrides
      ).toEqual([]);
    });
  });
});
