import { vi } from "vitest";

// The outbound client (`@watchdog/tools/http`) sends through undici's own `fetch`, which
// opens real sockets and bypasses `globalThis.fetch`, so MSW and `vi.stubGlobal("fetch")`
// would not see it. Tests route that one call back to the global `fetch` (the network
// boundary the suite mocks). `safe-fetch.test.ts` calls `vi.unmock("undici")` to exercise
// the real transport against loopback servers.
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // The `dispatcher` is an undici 8 `Agent`; the runtime's built-in fetch bundles its own
    // (older) undici and cannot drive it, and the mocked network boundary has no use for it.
    fetch: async (
      input: Parameters<typeof globalThis.fetch>[0],
      init?: Parameters<typeof globalThis.fetch>[1] & { dispatcher?: unknown }
    ) => {
      const { dispatcher: _dispatcher, ...rest } = init ?? {};
      return globalThis.fetch(input, rest);
    },
  };
});
