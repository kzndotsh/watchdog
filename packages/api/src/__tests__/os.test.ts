import { createRouterClient, ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { authed, graphChildWrite, resolveAuthMethod } from "../os";

const probe = authed
  .route({ method: "GET", path: "/probe", tags: ["test"] })
  .output(z.object({ ok: z.literal(true) }))
  .handler(async () => ({ ok: true as const }));

describe("os middleware", () => {
  it("rejects unauthenticated calls through authed", async () => {
    const caller = createRouterClient(probe, {
      context: {
        headers: new Headers(),
        actor: null,
        authMethod: "session",
      },
    });

    await expect(caller()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ORPCError && error.code === "UNAUTHORIZED"
    );
  });

  it("rejects authenticated callers with no organization", async () => {
    const caller = createRouterClient(probe, {
      context: {
        headers: new Headers(),
        actor: { userId: "u1", email: null, name: null, organizationId: null },
        authMethod: "session",
      },
    });

    await expect(caller()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ORPCError && error.code === "FORBIDDEN"
    );
  });

  it("allows authenticated calls through authed", async () => {
    const caller = createRouterClient(probe, {
      context: {
        headers: new Headers(),
        actor: {
          userId: "u1",
          email: null,
          name: null,
          organizationId: "org-test",
        },
        authMethod: "session",
      },
    });

    await expect(caller()).resolves.toEqual({ ok: true });
  });
});

describe("resolveAuthMethod", () => {
  it("infers apiKey from x-api-key when authMethod is omitted", () => {
    const headers = new Headers({ "x-api-key": "secret" });
    expect(resolveAuthMethod({ headers, actor: null })).toBe("apiKey");
  });

  it("defaults to session without api key headers", () => {
    expect(resolveAuthMethod({ headers: new Headers(), actor: null })).toBe(
      "session"
    );
  });
});

describe("graphChildWrite custody", () => {
  const writeProbe = graphChildWrite
    .route({ method: "POST", path: "/write-probe", tags: ["test"] })
    .input(
      z.object({
        confidence: z.enum(["unverified", "possible", "confirmed"]).optional(),
        userOverride: z.literal(true).optional(),
      })
    )
    .output(z.object({ ok: z.literal(true) }))
    .handler(async () => ({ ok: true as const }));

  const actor = {
    userId: "u1",
    email: null,
    name: null,
    organizationId: "org-test",
  };

  it("enforces userOverride when api key header is present", async () => {
    const caller = createRouterClient(
      { writeProbe },
      {
        context: {
          headers: new Headers({ "x-api-key": "secret" }),
          actor,
        },
      }
    );

    await expect(
      caller.writeProbe({ confidence: "unverified" })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ORPCError && error.code === "FORBIDDEN"
    );
  });
});
