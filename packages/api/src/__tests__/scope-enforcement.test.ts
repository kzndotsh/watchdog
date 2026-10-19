import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { requireScope } from "@watchdog/schemas/shared";
import type { ApiCredential } from "@watchdog/schemas/shared";
import { testActor, testApiKey } from "@watchdog/schemas/testing";

import { authed, pub, sessionAuthed } from "../os";

const ctx = (credential: ApiCredential) => ({
  headers: new Headers(),
  actor: testActor({ email: null, name: null }),
  credential,
});
const output = z.object({ ok: z.literal(true) });

const writeProbe = authed
  .meta({ scope: "graph:write" })
  .route({ method: "POST", path: "/scope-write", tags: ["test"] })
  .input(z.object({ n: z.number() }))
  .output(output)
  .handler(async () => ({ ok: true as const }));
// No value is ever valid: only the scope check can answer before validation does.
const neverValid = authed
  .meta({ scope: "graph:write" })
  .route({ method: "POST", path: "/scope-never-valid", tags: ["test"] })
  .input(z.string().refine(() => false, "never valid"))
  .output(output)
  .handler(async () => ({ ok: true as const }));
const readProbe = authed
  .meta({ scope: "cases:read" })
  .route({ method: "GET", path: "/scope-read", tags: ["test"] })
  .output(output)
  .handler(async () => ({ ok: true as const }));
const undeclared = authed
  .route({ method: "GET", path: "/scope-undeclared", tags: ["test"] })
  .output(output)
  .handler(async () => ({ ok: true as const }));
const sessionProbe = sessionAuthed
  .route({ method: "GET", path: "/scope-session", tags: ["test"] })
  .output(output)
  .handler(async () => ({ ok: true as const }));
const publicProbe = pub
  .route({ method: "GET", path: "/scope-public", tags: ["test"] })
  .output(output)
  .handler(async () => ({ ok: true as const }));

describe("scope enforcement middleware", () => {
  it("refuses a key without the scope as insufficient_scope, before input validation", async () => {
    await expect(
      createRouterClient(neverValid, {
        context: ctx(testApiKey("k", ["cases:read", "evidence:write"])),
      })("anything")
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { code: "insufficient_scope", requiredScope: "graph:write" },
    });
    // With the scope the same input reaches validation and fails there.
    await expect(
      createRouterClient(neverValid, {
        context: ctx(testApiKey("k", ["graph:write"])),
      })("anything")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("lets a key with the scope through, and a session without any scope", async () => {
    await expect(
      createRouterClient(writeProbe, {
        context: ctx(testApiKey("k", ["graph:write"])),
      })({ n: 1 })
    ).resolves.toEqual({ ok: true });
    await expect(
      createRouterClient(writeProbe, { context: ctx({ kind: "session" }) })({
        n: 1,
      })
    ).resolves.toEqual({ ok: true });
  });

  it("treats a write scope as read, and a read-only key as read only", async () => {
    await expect(
      createRouterClient(readProbe, {
        context: ctx(testApiKey("k", ["proposals:write"])),
      })()
    ).resolves.toEqual({ ok: true });
    await expect(
      createRouterClient(writeProbe, {
        context: ctx(testApiKey("k", ["cases:read"])),
      })({ n: 1 })
    ).rejects.toMatchObject({ data: { code: "insufficient_scope" } });
  });

  it("refuses a key on a procedure that declares no scope, and passes a session", async () => {
    await expect(
      createRouterClient(undeclared, { context: ctx(testApiKey("k")) })()
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    await expect(
      createRouterClient(undeclared, { context: ctx({ kind: "session" }) })()
    ).resolves.toEqual({ ok: true });
  });

  it("refuses a key on a session-only procedure with the plain forbidden code", async () => {
    await expect(
      createRouterClient(sessionProbe, { context: ctx(testApiKey("k")) })()
    ).rejects.toMatchObject({ code: "FORBIDDEN", data: { code: "forbidden" } });
    await expect(
      createRouterClient(sessionProbe, { context: ctx({ kind: "session" }) })()
    ).resolves.toEqual({ ok: true });
  });

  it("leaves a public procedure open", async () => {
    await expect(
      createRouterClient(publicProbe, {
        context: { headers: new Headers(), actor: null },
      })()
    ).resolves.toEqual({ ok: true });
  });
});

describe("requireScope (routes outside the router)", () => {
  it("passes a session and a key holding the scope", () => {
    expect(requireScope({ kind: "session" }, "cases:read")).toBeNull();
    expect(
      requireScope(testApiKey("k", ["graph:write"]), "cases:read")
    ).toBeNull();
  });

  it("answers 403 with the router's insufficient_scope body shape", async () => {
    const response = requireScope(testApiKey("k", []), "cases:read");
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({
      defined: true,
      code: "FORBIDDEN",
      status: 403,
      message: "This API key lacks the cases:read scope",
      data: { code: "insufficient_scope", requiredScope: "cases:read" },
    });
  });
});
