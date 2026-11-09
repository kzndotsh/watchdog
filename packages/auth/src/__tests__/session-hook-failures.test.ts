import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveUserOrganizationId = vi.hoisted(() => vi.fn());
const onAuthSessionCreated = vi.hoisted(() => vi.fn());
const logged = vi.hoisted(
  () => [] as { fields: Record<string, unknown>; error: unknown }[]
);

vi.mock("@watchdog/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@watchdog/db")>()),
  resolveUserOrganizationId,
  onAuthSessionCreated,
}));

vi.mock("@watchdog/log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@watchdog/log")>()),
  createLogger: (fields: Record<string, unknown>) => ({
    error: (error: unknown) => {
      logged.push({ fields, error });
    },
    emit: () => Promise.resolve(),
  }),
}));

import { db } from "@watchdog/db";

import { createAuth } from "../create-auth";

const hooks = createAuth({ db }).options.databaseHooks?.session?.create;
const created = {
  id: "session-1",
  userId: "user-1",
  token: "secret-token",
  expiresAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  logged.length = 0;
  resolveUserOrganizationId.mockReset();
  onAuthSessionCreated.mockReset();
});

describe("session create hooks", () => {
  it("logs a failed organization lookup with ids only, and still starts the session", async () => {
    resolveUserOrganizationId.mockRejectedValue(
      Object.assign(
        new Error("Failed query: params 203.0.113.9,ada@example.test"),
        {
          code: "57P01",
        }
      )
    );

    await expect(hooks?.before?.(created)).resolves.toBeUndefined();

    expect(logged).toEqual([
      {
        fields: {
          scope: "auth.session_create_before",
          userId: "user-1",
          errorName: "Error",
          sqlState: "57P01",
        },
        error: new Error("auth.session_create_before failed"),
      },
    ]);
  });

  it("logs a failed session stamp with ids only, and does not fail sign-in", async () => {
    onAuthSessionCreated.mockRejectedValue(
      new Error("Failed query: params 203.0.113.9,Mozilla ada@example.test")
    );

    await expect(hooks?.after?.(created)).resolves.toBeUndefined();

    expect(logged).toEqual([
      {
        fields: {
          scope: "auth.session_create_after",
          userId: "user-1",
          sessionId: "session-1",
          errorName: "Error",
          sqlState: undefined,
        },
        error: new Error("auth.session_create_after failed"),
      },
    ]);
    const text = JSON.stringify(logged, (_key, value: unknown) =>
      value instanceof Error ? value.message : value
    );
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("ada@example.test");
  });
});
