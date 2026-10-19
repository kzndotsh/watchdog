import { ORPCError, createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  InternalError,
  InvalidError,
  NotFoundError,
} from "@watchdog/core/errors";
import { testActor } from "@watchdog/schemas/testing";

import { apiErrorMap, withStableCode } from "../error-map";
import { toOrpcError } from "../map-domain-error";
import { router } from "../router";

describe("input validation errors", () => {
  it("carry the stable invalid code like a mapped InvalidError", async () => {
    const client = createRouterClient(router, {
      context: {
        headers: new Headers(),
        actor: testActor(),
        credential: { kind: "session" },
      },
    });
    const failure = await client.cases
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- deliberately malformed input
      .create({ name: 5 } as unknown as { name: string })
      .then(
        () => undefined,
        (error: unknown) => error
      );
    expect(failure).toBeInstanceOf(ORPCError);
    expect(failure).toMatchObject({
      code: "BAD_REQUEST",
      data: { code: "invalid" },
    });
  });
});

describe("apiErrorMap", () => {
  const tags = [
    new NotFoundError({ entity: "Case", id: "c1" }),
    new ConflictError({ reason: "duplicate" }),
    new InvalidError({ reason: "bad" }),
    new ForbiddenError({ reason: "no" }),
    new InternalError({ reason: "Failed to create Case" }),
  ];

  it("has one entry per tag, keyed by the transport code toOrpcError produces", () => {
    const produced = tags.map((tag) => toOrpcError(tag).code).sort();
    expect(Object.keys(apiErrorMap).sort()).toEqual(produced);
  });

  it("accepts the data toOrpcError emits and pins each tag's stable code", () => {
    for (const tag of tags) {
      const error = toOrpcError(tag);
      const entry = Object.entries(apiErrorMap).find(
        ([transport]) => transport === error.code
      )?.[1];
      expect(entry, error.code).toBeDefined();
      expect(entry?.data.safeParse(error.data).success).toBe(true);
      expect(error.data).toMatchObject({ code: tag.code });
    }
  });
});

describe("insufficient_scope", () => {
  it("is a FORBIDDEN arm that names the scope, and survives withStableCode", () => {
    const refusal = new ORPCError("FORBIDDEN", {
      defined: true,
      message: "This API key lacks the graph:write scope",
      data: { code: "insufficient_scope", requiredScope: "graph:write" },
    });
    expect(apiErrorMap.FORBIDDEN.data.safeParse(refusal.data).success).toBe(
      true
    );
    expect(
      apiErrorMap.FORBIDDEN.data.safeParse({
        code: "insufficient_scope",
        requiredScope: "admin:all",
      }).success
    ).toBe(false);
    expect(withStableCode(refusal)).toBe(refusal);
  });
});

describe("withStableCode", () => {
  it("turns an unrecognized defect into a 500 internal, keeping it as the cause", () => {
    const defect = new Error("driver blew up");
    const mapped = withStableCode(defect);
    expect(mapped).toBeInstanceOf(ORPCError);
    expect(mapped).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      data: { code: "internal" },
      cause: defect,
    });
  });

  it("adds the code to a bare FORBIDDEN and an uncoded INTERNAL_SERVER_ERROR", () => {
    expect(withStableCode(new ORPCError("FORBIDDEN"))).toMatchObject({
      data: { code: "forbidden" },
    });
    expect(
      withStableCode(new ORPCError("INTERNAL_SERVER_ERROR"))
    ).toMatchObject({ data: { code: "internal" } });
  });

  it("keeps validation issues next to the added code", () => {
    const issues = [{ message: "bad" }];
    expect(
      withStableCode(new ORPCError("BAD_REQUEST", { data: { issues } }))
    ).toMatchObject({ data: { code: "invalid", issues } });
  });

  it("replaces a data.code that does not belong to the transport code", () => {
    const wrong = new ORPCError("BAD_REQUEST", {
      data: { code: "conflict", issues: [] },
    });
    expect(withStableCode(wrong)).toMatchObject({
      code: "BAD_REQUEST",
      data: { code: "invalid", issues: [] },
    });
    const bogus = new ORPCError("INTERNAL_SERVER_ERROR", {
      data: { code: "anything" },
    });
    expect(withStableCode(bogus)).toMatchObject({ data: { code: "internal" } });
  });

  it("leaves mapped errors and codes outside the map untouched", () => {
    const mapped = toOrpcError(new NotFoundError({ entity: "Case", id: "c1" }));
    expect(withStableCode(mapped)).toBe(mapped);
    const unauthorized = new ORPCError("UNAUTHORIZED");
    expect(withStableCode(unauthorized)).toBe(unauthorized);
  });
});
