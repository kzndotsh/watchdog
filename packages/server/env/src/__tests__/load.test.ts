import { afterEach, describe, expect, it, vi } from "vitest";

const { config } = vi.hoisted(() => ({
  config: vi.fn(),
}));

vi.mock("dotenv", () => ({
  config,
}));

describe("loadRepoEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not read .env under Vitest", async () => {
    vi.resetModules();
    config.mockClear();
    const { loadRepoEnv } = await import("../load");
    loadRepoEnv();
    expect(config).not.toHaveBeenCalled();
  });

  it("loads repo-root .env only once per process", async () => {
    vi.stubEnv("VITEST", "");
    vi.resetModules();
    config.mockClear();
    const { loadRepoEnv } = await import("../load");
    loadRepoEnv();
    loadRepoEnv();
    expect(config).toHaveBeenCalledTimes(1);
    expect(config.mock.calls[0]?.[0]?.quiet).toBe(true);
  });
});
