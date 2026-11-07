import { beforeEach, describe, expect, it, vi } from "vitest";

describe("server env entrypoint with validation skipped", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");
  });

  it("still scrubs a configured secret the schema refuses", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "too-short-secret");
    const { env, sensitiveEnvValues } = await import("../server");
    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
    expect(sensitiveEnvValues()).toContain("too-short-secret");
  });
});
