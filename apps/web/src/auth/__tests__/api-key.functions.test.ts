import { describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(
  () => [] as ((input: unknown) => Promise<unknown>)[]
);
const validators = vi.hoisted(() => [] as unknown[]);
const createScopedApiKey = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (schema: unknown) => {
      validators.push(schema);
      return {
        handler: (handler: (input: unknown) => Promise<unknown>) => {
          handlers.push(handler);
          return `fn-${handlers.length}`;
        },
      };
    },
  }),
}));

vi.mock("@watchdog/auth/server", () => ({ createScopedApiKey }));

import { createApiKeyFn } from "@/auth/api-key.functions";

describe("createApiKeyFn", () => {
  it("creates the key as the session user in the server-resolved organization", async () => {
    createScopedApiKey.mockResolvedValue({ id: "k1", name: "ci", key: "wd_x" });
    expect(createApiKeyFn).toBe("fn-1");

    const result = await handlers[0]?.({
      data: { name: "ci", scopes: ["proposals:write"], expiresIn: 86_400 },
      context: {
        session: { user: { id: "user-1" }, session: {} },
        organizationId: "org-from-server",
      },
    });

    expect(result).toEqual({ id: "k1", name: "ci", key: "wd_x" });
    expect(createScopedApiKey).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      organizationId: "org-from-server",
      name: "ci",
      scopes: ["proposals:write"],
      expiresIn: 86_400,
    });
  });

  it("accepts no organization or user from the client", () => {
    const [schema] = validators as {
      safeParse: (v: unknown) => { success: boolean; data?: object };
    }[];
    const parsed = schema?.safeParse({
      scopes: ["cases:read"],
      organizationId: "org-evil",
      userId: "victim",
      metadata: { organizationId: "org-evil" },
    });
    expect(parsed?.success).toBe(true);
    expect(parsed?.data).toEqual({ scopes: ["cases:read"] });
    expect(schema?.safeParse({ scopes: ["admin:write"] }).success).toBe(false);
    expect(schema?.safeParse({ scopes: [] }).success).toBe(false);
  });
});
