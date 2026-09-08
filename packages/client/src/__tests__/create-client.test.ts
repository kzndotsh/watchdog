import { describe, expect, it, vi } from "vitest";

import { createWatchdogClient } from "../index.ts";

describe("createWatchdogClient", () => {
  it("strips a trailing slash and sends x-api-key", async () => {
    const fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createWatchdogClient({
      apiKey: "test-key",
      baseUrl: "http://127.0.0.1:9/api/v1/",
    });
    await client.cases.list().catch(() => null);

    expect(fetchMock).toHaveBeenCalled();
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const request =
      input instanceof Request ? input : new Request(String(input), init);
    expect(request.url).toMatch(/^http:\/\/127\.0\.0\.1:9\/api\/v1/);
    expect(request.url.includes("/api/v1//")).toBe(false);
    expect(request.headers.get("x-api-key")).toBe("test-key");
  });

  it("rejects blank api keys", () => {
    expect(() => createWatchdogClient({ apiKey: "" })).toThrow(
      /apiKey is required/
    );
    expect(() => createWatchdogClient({ apiKey: "   " })).toThrow(
      /apiKey is required/
    );
  });
});
