import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { createRequestLogger } from "evlog";
import { describe, expect, it, vi } from "vitest";

import {
  readArtifactBytesEffect,
  recordingBlobStore,
} from "@watchdog/core/blob";
import {
  type DomainTag,
  ConflictError,
  ForbiddenError,
  InternalError,
  InvalidError,
  MAX_ECHOED_ID_CHARS,
  NotFoundError,
  StaleVersionError,
} from "@watchdog/core/errors";
import { runWithRequestLogger } from "@watchdog/log";

import { toOrpcError } from "../map-domain-error";

describe("toOrpcError", () => {
  it("maps NotFoundError to NOT_FOUND", () => {
    const error = toOrpcError(new NotFoundError({ entity: "Case", id: "c1" }));
    expect(error).toBeInstanceOf(ORPCError);
    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "Case not found",
      data: { code: "not_found", entity: "Case", id: "c1" },
    });
  });

  it("marks every mapped error defined, so clients narrow it with isDefinedError", () => {
    for (const tag of [
      new NotFoundError({ entity: "Case", id: "c1" }),
      new ConflictError({ reason: "x" }),
      new StaleVersionError({ entity: "Claim", id: "c1", currentVersion: 2 }),
      new InvalidError({ reason: "x" }),
      new ForbiddenError({ reason: "x" }),
      new InternalError({ reason: "x" }),
    ]) {
      expect(toOrpcError(tag).defined, tag._tag).toBe(true);
    }
  });

  it("bounds the id a NotFoundError echoes to the client", () => {
    const mapped = toOrpcError(
      new NotFoundError({ entity: "Entity", id: `  ${"x".repeat(5000)}  ` })
    );
    const id = (mapped.data as { id: string }).id;
    expect(id.length).toBeLessThanOrEqual(MAX_ECHOED_ID_CHARS);
    expect(id).toBe(id.trim());
    expect(mapped.message).toBe("Entity not found");
  });

  it("maps a queue-driver InternalError to a 500 without the driver text", () => {
    const mapped = toOrpcError(
      new InternalError({
        reason: "pg-boss failed",
        cause: new Error("connect ECONNREFUSED 10.0.0.7:5432 (user=boss)"),
      })
    );
    expect(mapped).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
      data: { code: "internal" },
    });
    expect(JSON.stringify(mapped.toJSON())).not.toMatch(
      /ECONNREFUSED|10\.0\.0\.7|pg-boss|boss/
    );
  });

  it("maps StaleVersionError to CONFLICT with the row and its current version", () => {
    const error = toOrpcError(
      new StaleVersionError({
        entity: "Entity",
        id: "e1",
        currentVersion: 4,
      })
    );
    expect(error).toMatchObject({
      code: "CONFLICT",
      status: 409,
      defined: true,
      message: "Entity changed since you opened it",
      data: {
        code: "stale_version",
        entity: "Entity",
        id: "e1",
        currentVersion: 4,
      },
    });
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

  it("maps a blob storage failure to a 500 that carries no driver message", async () => {
    const driver = new Error("connect ECONNREFUSED 10.0.0.7:9000");
    const store = recordingBlobStore({
      respond: () => {
        throw driver;
      },
    });
    const error = await Effect.runPromise(
      readArtifactBytesEffect("case/any").pipe(
        Effect.flip,
        Effect.provide(store.layer)
      )
    );
    const mapped = toOrpcError(error);
    expect(mapped).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
      message: "Internal server error",
    });
    expect(JSON.stringify(mapped.toJSON())).not.toMatch(
      /ECONNREFUSED|10\.0\.0\.7|Failed to read/
    );
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

  describe("request log for InternalError", () => {
    function loggedFields(error: InternalError): {
      logged: Record<string, unknown>;
      body: string;
    } {
      const logger = createRequestLogger();
      const set = vi.spyOn(logger, "set");
      const mapped = runWithRequestLogger(logger, () => toOrpcError(error));
      expect(set).toHaveBeenCalledTimes(1);
      const [payload] = set.mock.calls[0] ?? [];
      return {
        logged: (payload as { error: Record<string, unknown> }).error,
        body: JSON.stringify(mapped.toJSON()),
      };
    }

    function loggedInvalid(error: InvalidError) {
      const logger = createRequestLogger();
      const set = vi.spyOn(logger, "set");
      const mapped = runWithRequestLogger(logger, () => toOrpcError(error));
      const [payload] = set.mock.calls[0] ?? [];
      return {
        logged: (payload as { error: Record<string, unknown> }).error,
        body: JSON.stringify(mapped.toJSON()),
      };
    }

    it("records reason and the full Error cause (name, message, stack) off the HTTP body", () => {
      const cause = new TypeError("driver detail");
      const { logged, body } = loggedFields(
        new InternalError({ reason: "Failed to create Case", cause })
      );
      expect(logged).toMatchObject({
        domainTag: "InternalError",
        reason: "Failed to create Case",
        cause: {
          name: "TypeError",
          message: "driver detail",
          stack: cause.stack,
        },
      });
      expect(body).not.toMatch(/driver detail|Failed to create|TypeError/);
    });

    it("records a non-Error cause as a truncated string", () => {
      const long = "x".repeat(5000);
      const { logged } = loggedFields(
        new InternalError({ reason: "boom", cause: { code: long } })
      );
      expect(typeof logged.cause).toBe("string");
      expect((logged.cause as string).length).toBeLessThan(1100);
      const plain = loggedFields(
        new InternalError({ reason: "boom", cause: "pg down" })
      );
      expect(plain.logged.cause).toBe("pg down");
    });

    it("logs an InvalidError's cause but never sends it in the body", () => {
      const mapped = loggedInvalid(
        new InvalidError({
          reason: "Page enrich failed",
          cause: "HTTP 502 from 10.0.0.9",
        })
      );
      expect(mapped.logged).toMatchObject({
        domainTag: "InvalidError",
        cause: "HTTP 502 from 10.0.0.9",
      });
      expect(mapped.body).toContain("Page enrich failed");
      expect(mapped.body).not.toMatch(/10\.0\.0\.9|502/);
    });

    it("logs only the tag for non-internal errors", () => {
      const logger = createRequestLogger();
      const set = vi.spyOn(logger, "set");
      runWithRequestLogger(logger, () =>
        toOrpcError(new InvalidError({ reason: "bad input" }))
      );
      expect(set).toHaveBeenCalledWith({
        error: { domainTag: "InvalidError" },
      });
    });
  });

  it.each([
    [
      "NotFoundError",
      new NotFoundError({ entity: "Claim", id: "missing" }),
      "not_found",
    ],
    ["ConflictError", new ConflictError({ reason: "dup" }), "conflict"],
    ["InvalidError", new InvalidError({ reason: "bad" }), "invalid"],
    ["ForbiddenError", new ForbiddenError({ reason: "no" }), "forbidden"],
    [
      "InternalError",
      new InternalError({ reason: "secret", cause: "pg down" }),
      "internal",
    ],
  ] satisfies [string, DomainTag, string][])(
    "puts stable code and safe message in the body for %s",
    (_tag, error, code) => {
      const json = toOrpcError(error).toJSON();
      expect(json.data).toMatchObject({ code });
      expect(error.code).toBe(code);
      let expected = "Internal server error";
      if (error._tag === "NotFoundError") expected = "Claim not found";
      else if (error._tag !== "InternalError") expected = error.reason;
      expect(json.message).toBe(expected);
    }
  );

  it("gives every tag a distinct code", () => {
    const codes = [
      new NotFoundError({ entity: "Case", id: "x" }),
      new ConflictError({ reason: "x" }),
      new StaleVersionError({ entity: "Claim", id: "c1", currentVersion: 2 }),
      new InvalidError({ reason: "x" }),
      new ForbiddenError({ reason: "x" }),
      new InternalError({ reason: "x" }),
    ].map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it.each([
    ["NotFoundError", new NotFoundError({ entity: "Case", id: "x" }), 404],
    ["ConflictError", new ConflictError({ reason: "x" }), 409],
    [
      "StaleVersionError",
      new StaleVersionError({ entity: "Claim", id: "c1", currentVersion: 2 }),
      409,
    ],
    ["InvalidError", new InvalidError({ reason: "x" }), 400],
    ["ForbiddenError", new ForbiddenError({ reason: "x" }), 403],
    ["InternalError", new InternalError({ reason: "x" }), 500],
  ])("maps %s to HTTP status %i", (_tag, error, status) => {
    expect(toOrpcError(error).status).toBe(status);
  });
});
