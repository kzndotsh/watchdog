import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { appRuntime } from "@watchdog/api";
import { uploadArtifactEffect } from "@watchdog/core/blob";
import { runDomain } from "@watchdog/core/infra";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedJob,
  seedProviderCall,
  testDb,
} from "@watchdog/test-db";
import { testHttpOrigin } from "@watchdog/test-kit";

/**
 * The raw-response download (#498) against real data and the real object store: the bytes of a
 * stored provider response are served only as an attachment of generic bytes, only to the
 * organization that owns the Case. Only the session lookup is replaced.
 */
const session = vi.hoisted(() => ({
  organizationId: null as string | null,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

// Better Auth is the boundary: the route's own `createApiContext` runs, over this session.
vi.mock("@/auth/server", () => ({ auth: {}, authDb: {} }));

vi.mock("@watchdog/auth/server", () => ({
  createApiContext: vi.fn(() =>
    Promise.resolve({
      headers: new Headers(),
      credential: { kind: "session" },
      actor:
        session.organizationId === null
          ? null
          : {
              userId: "response-user",
              email: null,
              name: "Response user",
              organizationId: session.organizationId,
            },
      log: { set: vi.fn() },
    })
  ),
}));

import { Route } from "@/routes/api/v1/cases.$caseId.provider-calls.$callId.response";

const ORG_A: OrganizationId = TEST_ORGANIZATION_ID;
const ORG_B: OrganizationId = TEST_OTHER_ORGANIZATION_ID;

type Handler = (ctx: {
  request: Request;
  params: { caseId: string; callId: string };
}) => Promise<Response>;

function handler(): Handler {
  const server: unknown = Reflect.get(Route.options, "server");
  const handlers: unknown =
    typeof server === "object" && server !== null
      ? Reflect.get(server, "handlers")
      : undefined;
  const get: unknown =
    typeof handlers === "object" && handlers !== null
      ? Reflect.get(handlers, "GET")
      : undefined;
  if (typeof get !== "function") return expect.unreachable("no GET handler");
  return (ctx) => get(ctx);
}

function download(caseId: string, callId: string) {
  return handler()({
    request: new Request(
      testHttpOrigin(
        "localhost",
        `/api/v1/cases/${caseId}/provider-calls/${callId}/response`
      )
    ),
    params: { caseId, callId },
  });
}

/** Seeds a call; with `body`, the response is stored in the object store and linked in the outcome. */
async function seedCall(caseId: CaseId, body: string | null) {
  const job = await seedJob(testDb, caseId, { status: "succeeded" });
  const stored =
    body === null
      ? null
      : await runDomain(
          uploadArtifactEffect({
            caseId,
            bytes: new TextEncoder().encode(body),
            mime: "application/octet-stream",
            name: "provider-response",
          })
        );
  const call = await seedProviderCall(testDb, caseId, job.id, {
    outcome:
      stored === null
        ? undefined
        : {
            bodyState: "stored",
            bodyReason: null,
            bodySha256: stored.sha256,
            bodyBytes: stored.byteLength,
            blobKey: stored.uri,
          },
  });
  return call.id;
}

const PAGE = "<html><script>alert(1)</script></html>";

let caseA: CaseId;
let storedCall: string;
let hashedCall: string;

describe("the provider response download route", () => {
  beforeAll(async () => {
    await resetTestDb();
    caseA = (await seedCase(testDb, { organizationId: ORG_A })).id;
    storedCall = await seedCall(caseA, PAGE);
    hashedCall = await seedCall(caseA, null);
  });

  afterAll(async () => {
    session.organizationId = null;
    await appRuntime.dispose();
  });

  it("serves the stored bytes as an attachment of generic bytes, never inline", async () => {
    session.organizationId = ORG_A;

    const response = await download(caseA, storedCall);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/octet-stream"
    );
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="provider-response-[0-9a-f-]+\.bin"$/
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    // The provider said text/html; none of that reaches the response.
    expect(response.headers.get("Content-Type")).not.toContain("html");
    expect(await response.text()).toBe(PAGE);
  });

  it("answers 401 without a session", async () => {
    session.organizationId = null;

    expect((await download(caseA, storedCall)).status).toBe(401);
  });

  it("answers 404 to a member of another organization, the same as for a call that does not exist", async () => {
    session.organizationId = ORG_B;

    const foreign = await download(caseA, storedCall);
    const missing = await download(caseA, randomUUID());

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.text()).toBe(await missing.text());
  });

  it("answers 404 for a call whose body was only hashed", async () => {
    session.organizationId = ORG_A;

    expect((await download(caseA, hashedCall)).status).toBe(404);
  });

  it("answers 404 for a call id asked through another Case of the same organization", async () => {
    session.organizationId = ORG_A;
    const caseSibling = (await seedCase(testDb, { organizationId: ORG_A })).id;

    expect((await download(caseSibling, storedCall)).status).toBe(404);
  });
});
