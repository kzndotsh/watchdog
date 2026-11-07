import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeVault } from "@watchdog/core/vault";
import { testActor } from "@watchdog/schemas/testing";

import { toOrpcError } from "../../map-domain-error";
import * as runtime from "../../runtime";
import { list, put, remove } from "../credentials";

const actor = testActor();

// The procedures and the core credential helpers run unpatched: only the vault service is
// swapped, through a Layer, for the `runApp` edge they all run on.
const vault = fakeVault();
vi.spyOn(runtime, "runApp").mockImplementation(async (effect) =>
  runtime.appRuntime.runPromise(
    effect.pipe(Effect.mapError(toOrpcError), Effect.provide(vault.layer))
  )
);

afterAll(() => {
  vi.restoreAllMocks();
});

const context = {
  headers: new Headers(),
  actor,
  credential: { kind: "session" } as const,
};

describe("credentials procedures", () => {
  // The fake vault is one in-memory map shared by every test (and every repeat):
  // reseed it so a delete or put never leaks into the next test.
  beforeEach(() => {
    vault.secrets.clear();
    vault.secrets.set("u1", new Map([["AI_COMPAT_API_KEY", "sk-test"]]));
  });

  it("lists credential slots for the actor from the vault service", async () => {
    const slots = await createRouterClient({ list }, { context }).list();

    expect(
      slots.find((slot) => slot.name === "AI_COMPAT_API_KEY")
    ).toMatchObject({ configured: true });
  });

  it("stores a secret through the vault service and never returns it", async () => {
    const slot = await createRouterClient({ put }, { context }).put({
      name: "SHODAN_API_KEY",
      secret: "  s3cret  ",
    });

    expect(slot).toMatchObject({ name: "SHODAN_API_KEY", configured: true });
    expect(JSON.stringify(slot)).not.toContain("s3cret");
    expect(vault.secrets.get("u1")?.get("SHODAN_API_KEY")).toBe("s3cret");
  });

  it("deletes a credential and reports a missing one as not found", async () => {
    const client = createRouterClient({ remove }, { context });
    await expect(client.remove({ name: "AI_COMPAT_API_KEY" })).resolves.toEqual(
      { ok: true }
    );
    await expect(
      client.remove({ name: "AI_COMPAT_API_KEY" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects invalid credential names at ingress", async () => {
    await expect(
      createRouterClient({ put }, { context }).put({
        name: "shodan",
        secret: "secret",
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });
});
