import { describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({
  loadCliEnv: vi.fn(() => ({
    WD_API_URL: "http://127.0.0.1:3000",
    WD_API_KEY: "test-key",
  })),
}));

const createWatchdogClient = vi.fn((cfg: unknown) => ({ cfg }));

vi.mock("@watchdog/client", () => ({
  createWatchdogClient: (cfg: unknown) => createWatchdogClient(cfg),
}));

import { api, getConfig } from "../client";

describe("cli client", () => {
  it("getConfig reads api url and key from cli env", () => {
    expect(getConfig()).toEqual({
      apiUrl: "http://127.0.0.1:3000",
      apiKey: "test-key",
    });
  });

  it("api builds a typed client from config", () => {
    const client = api();
    expect(createWatchdogClient).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:3000",
      apiKey: "test-key",
    });
    expect(client).toEqual({
      cfg: { baseUrl: "http://127.0.0.1:3000", apiKey: "test-key" },
    });
  });
});
