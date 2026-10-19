import { createRouterClient, ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { testActor, testApiKey } from "@watchdog/schemas/testing";

import { authed, graphChildWrite, sessionAuthed } from "../os";

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
        credential: { kind: "session" },
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
        actor: testActor({ email: null, name: null }),
        credential: { kind: "session" },
      },
    });

    await expect(caller()).resolves.toEqual({ ok: true });
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

  const actor = testActor({ email: null, name: null });

  it("enforces userOverride for an API key credential", async () => {
    const caller = createRouterClient(
      { writeProbe },
      {
        context: {
          headers: new Headers(),
          actor,
          credential: testApiKey("key-1"),
        },
      }
    );

    await expect(
      caller.writeProbe({ confidence: "unverified" })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ORPCError && error.code === "FORBIDDEN"
    );
    await expect(
      caller.writeProbe({ confidence: "unverified", userOverride: true })
    ).resolves.toEqual({ ok: true });
  });

  it("does not take an API key header for a key: the credential decides", async () => {
    const caller = createRouterClient(
      { writeProbe },
      {
        context: {
          headers: new Headers({ "x-api-key": "secret" }),
          actor,
          credential: { kind: "session" },
        },
      }
    );

    await expect(
      caller.writeProbe({ confidence: "confirmed" })
    ).resolves.toEqual({ ok: true });
  });
});

describe("sessionAuthed", () => {
  const sessionProbe = sessionAuthed
    .route({ method: "GET", path: "/session-probe", tags: ["test"] })
    .output(z.object({ ok: z.literal(true) }))
    .handler(async () => ({ ok: true as const }));
  const actor = testActor({ email: null, name: null });

  it("refuses an API key and lets a session through", async () => {
    const asKey = createRouterClient(sessionProbe, {
      context: {
        headers: new Headers(),
        actor,
        credential: testApiKey("key-1"),
      },
    });
    await expect(asKey()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ORPCError && error.code === "FORBIDDEN"
    );

    const asSession = createRouterClient(sessionProbe, {
      context: {
        headers: new Headers(),
        actor,
        credential: { kind: "session" },
      },
    });
    await expect(asSession()).resolves.toEqual({ ok: true });
  });
});
