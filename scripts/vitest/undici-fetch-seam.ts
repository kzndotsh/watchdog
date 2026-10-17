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
    fetch: async (...args: Parameters<typeof globalThis.fetch>) =>
      globalThis.fetch(...args),
  };
});
