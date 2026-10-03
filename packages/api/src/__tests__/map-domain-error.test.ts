import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  InternalError,
  InvalidError,
  NotFoundError,
} from "@watchdog/core";
import { runWithRequestLogger } from "@watchdog/log";

import { toOrpcError } from "../map-domain-error";

describe("toOrpcError", () => {
  it("maps NotFoundError to NOT_FOUND", () => {
    expect(
      toOrpcError(new NotFoundError({ resource: "missing case" }))
    ).toMatchObject({
      code: "NOT_FOUND",
      message: "missing case",
    });
    expect(toOrpcError(new NotFoundError({ resource: "x" }))).toBeInstanceOf(
      ORPCError
    );
  });

  it("maps ConflictError to CONFLICT", () => {
    expect(
      toOrpcError(new ConflictError({ reason: "duplicate slug" }))
    ).toMatchObject({
      code: "CONFLICT",
      message: "duplicate slug",
    });
  });

  it("maps InvalidError to BAD_REQUEST", () => {
    expect(
      toOrpcError(new InvalidError({ reason: "bad input" }))
    ).toMatchObject({
      code: "BAD_REQUEST",
      message: "bad input",
    });
  });

  it("maps ForbiddenError to FORBIDDEN", () => {
    expect(
      toOrpcError(new ForbiddenError({ reason: "custody blocked" }))
    ).toMatchObject({
      code: "FORBIDDEN",
      message: "custody blocked",
    });
  });

  it("maps InternalError to INTERNAL_SERVER_ERROR with a generic message", () => {
    const mapped = toOrpcError(
      new InternalError({
        reason: "Failed to create Case",
        cause: new Error('relation "cases" does not exist'),
      })
    );
    expect(mapped).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
    });
    expect(mapped.message).toBe("Internal server error");
    expect(JSON.stringify(mapped.toJSON())).not.toMatch(
      /Failed to create|cases/
    );
  });

  it("sends the InternalError reason and cause to the request log only", () => {
    const set = vi.fn();
    const cause = new Error("driver detail");
    runWithRequestLogger({ set } as never, () =>
      toOrpcError(new InternalError({ reason: "Failed to create Case", cause }))
    );
    expect(set).toHaveBeenCalledWith({
      error: expect.objectContaining({
        domainTag: "InternalError",
        reason: "Failed to create Case",
      }),
    });
  });

  it.each([
    ["NotFoundError", new NotFoundError({ resource: "x" }), 404],
    ["ConflictError", new ConflictError({ reason: "x" }), 409],
    ["InvalidError", new InvalidError({ reason: "x" }), 400],
    ["ForbiddenError", new ForbiddenError({ reason: "x" }), 403],
    ["InternalError", new InternalError({ reason: "x" }), 500],
  ])("maps %s to HTTP status %i", (_tag, error, status) => {
    expect(toOrpcError(error).status).toBe(status);
  });
});
