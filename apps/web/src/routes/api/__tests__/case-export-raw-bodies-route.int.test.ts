import { unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { authServerDouble } from "@/testing/auth-server-double";
import { appRuntime } from "@watchdog/api";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedOrganizationMember,
  testDb,
} from "@watchdog/test-db";
import { testHttpOrigin } from "@watchdog/test-kit";

/**
 * The per-Export opt-in for raw provider responses on `export.zip` (#499), against real data:
 * only a signed-in owner or admin may ask for `?rawBodies=1`; a member and an API key (even one
 * that belongs to the owner and holds every scope) get the router's `forbidden` answer before
 * anything is built. Only the session lookup is replaced.
 */
const caller = vi.hoisted(() => ({
  userId: "raw-owner",
  kind: "session" as "session" | "apiKey",
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

// Better Auth is the boundary: the route's own `createApiContext` runs, over this caller.
// The integration project does not register the web setup file, so the shared double is mocked here.
vi.mock("@/auth/server", () => authServerDouble());

vi.mock("@watchdog/auth/server", () => ({
  createApiContext: vi.fn(async () => {
    const { testApiKey: key, TEST_ORGANIZATION_ID: organizationId } =
      await import("@watchdog/schemas/testing");
    return {
      headers: new Headers(),
      credential:
        caller.kind === "session" ? { kind: "session" } : key("raw-body-key"),
      actor: {
        userId: caller.userId,
        email: null,
        name: caller.userId,
        organizationId,
      },
      log: { set: vi.fn() },
    };
  }),
}));

import { Route } from "@/routes/api/v1/cases.$caseId.export[.]zip";

type GetHandler = (ctx: {
  request: Request;
  params: { caseId: string };
}) => Promise<Response>;

function getHandler(): GetHandler {
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

let caseId = "";

function exportAs(
  userId: string,
  kind: "session" | "apiKey",
  query: string
): Promise<Response> {
  caller.userId = userId;
  caller.kind = kind;
  return getHandler()({
    request: new Request(
      testHttpOrigin("localhost", `/api/v1/cases/${caseId}/export.zip${query}`)
    ),
    params: { caseId },
  });
}

async function paths(response: Response): Promise<string[]> {
  return Object.keys(unzipSync(new Uint8Array(await response.arrayBuffer())));
}

describe("export.zip raw-body opt-in", () => {
  beforeAll(async () => {
    await resetTestDb();
    for (const [userId, role] of [
      ["raw-owner", "owner"],
      ["raw-admin", "admin"],
      ["raw-member", "member"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one member row per role
      await seedOrganizationMember(testDb, {
        organizationId: TEST_ORGANIZATION_ID,
        userId,
        role,
      });
    }
    caseId = (await seedCase(testDb, { name: "Raw opt-in" })).id;
  });

  afterAll(async () => {
    await appRuntime.dispose();
  });

  it("serves the archive, with the provenance files, to an owner and an admin who opt in", async () => {
    for (const userId of ["raw-owner", "raw-admin"]) {
      // oxlint-disable-next-line no-await-in-loop -- sequential requests, one caller each
      const response = await exportAs(userId, "session", "?rawBodies=1");
      expect(response.status).toBe(200);
      // oxlint-disable-next-line no-await-in-loop -- reads this response's body
      const names = await paths(response);
      expect(names.some((n) => n.endsWith("/provider-calls.jsonl"))).toBe(true);
      expect(names.some((n) => n.endsWith("/ATTRIBUTION.md"))).toBe(true);
      expect(names.some((n) => n.endsWith("/VERIFY.md"))).toBe(true);
    }
  });

  it("refuses a member who opts in with the forbidden error, and builds nothing", async () => {
    const response = await exportAs("raw-member", "session", "?rawBodies=1");

    expect(response.status).toBe(403);
    expect(response.headers.get("Content-Type")).not.toBe("application/zip");
    expect(await response.json()).toMatchObject({
      code: "FORBIDDEN",
      data: { code: "forbidden" },
    });
  });

  it("refuses an API key that opts in, even one that belongs to the owner and holds every scope", async () => {
    const response = await exportAs("raw-owner", "apiKey", "?rawBodies=1");

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "FORBIDDEN",
      data: { code: "forbidden" },
    });
  });

  it("still gives a member and a key the plain export, with the provenance files", async () => {
    for (const [userId, kind] of [
      ["raw-member", "session"],
      ["raw-owner", "apiKey"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- sequential requests, one caller each
      const response = await exportAs(userId, kind, "");
      expect(response.status).toBe(200);
      // oxlint-disable-next-line no-await-in-loop -- reads this response's body
      const names = await paths(response);
      expect(names.some((n) => n.endsWith("/provider-calls.jsonl"))).toBe(true);
    }
  });
});
