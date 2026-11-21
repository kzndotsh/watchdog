/**
 * Type test (#123, spec story 18): `pnpm typecheck` compiles this file, so it
 * fails the build the day a mapped error stops exposing a typed `data.code`.
 * The function is never invoked; the runtime assertion only keeps vitest honest.
 */
import { isDefinedError, safe } from "@orpc/client";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { createWatchdogClient, type WatchdogClient } from "../index.ts";

/** Every stable code the API returns in the error `data` (docs/reference/contracts). */
type ApiErrorCode =
  | "not_found"
  | "conflict"
  | "stale_version"
  | "job_start_limited"
  | "cursor_stale"
  | "invalid"
  | "forbidden"
  | "insufficient_scope"
  | "internal";

async function narrowOnCode(client: WatchdogClient) {
  const [error] = await safe(client.cases.get({ caseId: "case-id" }));
  if (error === null || !isDefinedError(error)) return;

  // The union of every mapped error's `data.code` is exactly the known codes.
  expectTypeOf(error.data.code).toEqualTypeOf<ApiErrorCode>();

  // Branching on the transport code narrows the data.
  if (error.code === "NOT_FOUND") {
    expectTypeOf(error.data.code).toEqualTypeOf<"not_found">();
    expectTypeOf(error.data.id).toBeString();
    expectTypeOf(error.data.entity).toBeString();
  }
  if (error.code === "FORBIDDEN" && error.data.code === "insufficient_scope") {
    expectTypeOf(error.data.requiredScope).toEqualTypeOf<
      "cases:read" | "evidence:write" | "graph:write" | "proposals:write"
    >();
  }
  if (error.code === "CONFLICT" && error.data.code === "stale_version") {
    expectTypeOf(error.data.currentVersion).toBeNumber();
    expectTypeOf(error.data.id).toBeString();
  }
  if (error.code === "TOO_MANY_REQUESTS") {
    expectTypeOf(error.data.code).toEqualTypeOf<"job_start_limited">();
    expectTypeOf(error.data.scope).toEqualTypeOf<"organization" | "key">();
    expectTypeOf(error.data.retryAfterSeconds).toBeNumber();
  }
  if (error.code === "BAD_REQUEST") {
    expectTypeOf(error.data.code).toEqualTypeOf<"invalid" | "cursor_stale">();
  }
  if (error.code === "INTERNAL_SERVER_ERROR") {
    expectTypeOf(error.data.code).toEqualTypeOf<"internal">();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("typed error code in the client", () => {
  it("compiles (the assertions above are type-level)", () => {
    expect(typeof narrowOnCode).toBe("function");
  });

  it("narrows a real API error body at runtime (defined error, typed data)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json(
          {
            defined: true,
            code: "NOT_FOUND",
            status: 404,
            message: "Case not found",
            data: { code: "not_found", entity: "Case", id: "case-id" },
          },
          { status: 404 }
        )
      )
    );
    const client = createWatchdogClient({
      apiKey: "test-key",
      baseUrl: "http://127.0.0.1:9/api/v1",
    });
    const [error] = await safe(client.cases.get({ caseId: "case-id" }));
    expect(error !== null && isDefinedError(error)).toBe(true);
    if (error === null || !isDefinedError(error)) return;
    expect(error.data.code).toBe("not_found");
    expect(error.code).toBe("NOT_FOUND");
  });
});
