import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("server env entrypoint with validation skipped", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to load in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("../server")).rejects.toThrow(/SKIP_ENV_VALIDATION/);
  });

  it("still scrubs a configured secret the schema refuses", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "too-short-secret");
    const { env, sensitiveEnvValues } = await import("../server");
    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
    expect(sensitiveEnvValues()).toContain("too-short-secret");
  });
});
