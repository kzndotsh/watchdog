import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (fn: unknown) => fn,
    }),
    handler: (fn: unknown) => fn,
  }),
}));

const credentialsApi = {
  list: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: () => ({ credentials: credentialsApi }),
}));

import {
  deleteCredentialFn,
  listCredentialsFn,
  putCredentialFn,
} from "@/domains/settings/settings.functions";

interface ServerContext {
  context: Record<string, never>;
}
interface ServerDataContext<T> {
  data: T;
  context: Record<string, never>;
}

describe("settings.functions", () => {
  it("lists credentials through oRPC", async () => {
    const slots = [{ name: "SHODAN_API_KEY", label: "Shodan" }];
    credentialsApi.list.mockResolvedValue(slots);

    await expect(
      (
        listCredentialsFn as unknown as (
          input: ServerContext
        ) => Promise<unknown>
      )({ context: {} })
    ).resolves.toEqual(slots);
  });

  it("puts and deletes credentials through oRPC", async () => {
    const slot = { name: "SHODAN_API_KEY", label: "Shodan" };
    credentialsApi.put.mockResolvedValue(slot);
    credentialsApi.delete.mockResolvedValue(undefined);

    await expect(
      (
        putCredentialFn as unknown as (
          input: ServerDataContext<{
            name: string;
            secret: string;
            label: string;
          }>
        ) => Promise<unknown>
      )({
        data: {
          name: "SHODAN_API_KEY",
          secret: "abc",
          label: "Shodan",
        },
        context: {},
      })
    ).resolves.toEqual(slot);

    await expect(
      (
        deleteCredentialFn as unknown as (
          input: ServerDataContext<{ name: string }>
        ) => Promise<{ ok: true }>
      )({ data: { name: "SHODAN_API_KEY" }, context: {} })
    ).resolves.toEqual({ ok: true });
    expect(credentialsApi.delete).toHaveBeenCalledWith({
      name: "SHODAN_API_KEY",
    });
  });
});
