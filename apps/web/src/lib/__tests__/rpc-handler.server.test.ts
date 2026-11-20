import { describe, expect, it, vi } from "vitest";

import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { testHttpOrigin } from "@watchdog/test-kit";

const createApiContext = vi.hoisted(() => vi.fn());

// Who is calling is resolved by the auth package (session cookie or API key); the handler,
// its plugins and the router run for real.
vi.mock("@watchdog/auth/server", () => ({ createApiContext }));

import { handleRpcRequest } from "@/lib/rpc-handler.server";

/** A signed-in session of the test organization, as `createApiContext` resolves it. */
function sessionContext() {
  return {
    headers: new Headers(),
    actor: {
      userId: "rpc-user",
      email: null,
      name: "rpc-user",
      organizationId: TEST_ORGANIZATION_ID,
    },
    credential: { kind: "session" as const },
  };
}

/** An RPC-protocol call of `auth.whoami` (no input), with or without the CSRF header. */
function whoamiRequest(headers: Record<string, string> = {}) {
  return new Request(testHttpOrigin("localhost", "/api/rpc/auth/whoami"), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({}),
  });
}

describe("handleRpcRequest", () => {
  it("refuses a call without the CSRF header before the procedure runs", async () => {
    createApiContext.mockResolvedValue(sessionContext());

    const response = await handleRpcRequest(whoamiRequest());

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(TEST_ORGANIZATION_ID);
  });

  it("refuses a call whose CSRF header has another value", async () => {
    createApiContext.mockResolvedValue(sessionContext());

    const response = await handleRpcRequest(
      whoamiRequest({ "x-csrf-token": "forged" })
    );

    expect(response.status).toBe(403);
  });

  it("runs the procedure in the caller's context when the header is set", async () => {
    createApiContext.mockResolvedValue(sessionContext());

    const response = await handleRpcRequest(
      whoamiRequest({ "x-csrf-token": "orpc" })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(TEST_ORGANIZATION_ID);
  });

  it("refuses a GET for a procedure not declared GET (strict GET)", async () => {
    createApiContext.mockResolvedValue(sessionContext());

    const response = await handleRpcRequest(
      new Request(testHttpOrigin("localhost", "/api/rpc/claims/create"), {
        headers: { "x-csrf-token": "orpc" },
      })
    );

    expect(response.status).toBe(405);
  });

  it("answers 404 outside the router", async () => {
    createApiContext.mockResolvedValue(sessionContext());

    const response = await handleRpcRequest(
      new Request(testHttpOrigin("localhost", "/api/rpc/no/such"), {
        method: "POST",
        headers: { "x-csrf-token": "orpc" },
      })
    );

    expect(response.status).toBe(404);
  });
});
