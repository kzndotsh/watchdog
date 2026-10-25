import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { ConflictError, ForbiddenError } from "@watchdog/core/errors";

import { toOrpcError } from "../map-domain-error";
import { refusalResponse } from "../refusal-response";

describe("refusalResponse", () => {
  it("answers a forbidden domain error with the router's 403 body", async () => {
    const response = refusalResponse(
      toOrpcError(new ForbiddenError({ reason: "Only owners" }))
    );

    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({
      code: "FORBIDDEN",
      data: { code: "forbidden" },
    });
  });

  it("answers a conflict with 409", () => {
    const response = refusalResponse(
      toOrpcError(new ConflictError({ reason: "Another export is running" }))
    );

    expect(response?.status).toBe(409);
  });

  it("leaves every other error to the caller", () => {
    expect(refusalResponse(new Error("boom"))).toBeNull();
    expect(
      refusalResponse(new ORPCError("INTERNAL_SERVER_ERROR", { status: 500 }))
    ).toBeNull();
    expect(refusalResponse(undefined)).toBeNull();
  });
});
