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
    resolveUserOrganizationId.mockRejectedValue(new Error("db down"));

    await expect(hooks?.before?.(created)).resolves.toBeUndefined();

    expect(logged).toEqual([
      {
        fields: { scope: "auth.session_create_before", userId: "user-1" },
        error: new Error("db down"),
      },
    ]);
  });

  it("logs a failed session stamp with ids only, and does not fail sign-in", async () => {
    onAuthSessionCreated.mockRejectedValue(new Error("stamp failed"));

    await expect(hooks?.after?.(created)).resolves.toBeUndefined();

    expect(logged).toEqual([
      {
        fields: {
          scope: "auth.session_create_after",
          userId: "user-1",
          sessionId: "session-1",
        },
        error: new Error("stamp failed"),
      },
    ]);
    expect(JSON.stringify(logged)).not.toContain("secret-token");
  });
});
