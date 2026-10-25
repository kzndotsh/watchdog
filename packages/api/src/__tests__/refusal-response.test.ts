import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  InvalidError,
} from "@watchdog/core/errors";

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

  it("answers a refused caller input with 400, not a server error", () => {
    // E.g. asking for breach credentials in an Export while WD_BREACH_CAPS is not full.
    const response = refusalResponse(
      toOrpcError(new InvalidError({ reason: "Not available in safe mode" }))
    );

    expect(response?.status).toBe(400);
  });

  it("leaves every other error to the caller", () => {
    expect(refusalResponse(new Error("boom"))).toBeNull();
    expect(
      refusalResponse(new ORPCError("INTERNAL_SERVER_ERROR", { status: 500 }))
    ).toBeNull();
    expect(refusalResponse(undefined)).toBeNull();
  });
});
