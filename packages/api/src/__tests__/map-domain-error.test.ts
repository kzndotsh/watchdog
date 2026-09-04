import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  InvalidError,
  NotFoundError,
} from "@watchdog/core";

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
});
