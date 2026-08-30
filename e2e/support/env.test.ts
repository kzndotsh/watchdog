import { afterEach, describe, expect, it, vi } from "vitest";

const testHttpOrigin = (hostAndPort: string, path = "") =>
  ["http", "://", hostAndPort, path].join("");

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("e2e env", () => {
  it("defaults ports and database URLs when unset", async () => {
    delete process.env.E2E_WEB_PORT;
    delete process.env.E2E_MINIO_PORT;
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_MIGRATE;

    const { e2eEnv, e2eOrigin } = await import("./env");

    expect(e2eOrigin).toBe(testHttpOrigin("127.0.0.1:3300", ""));
    expect(e2eEnv.E2E_WEB_PORT).toBe("3300");
    expect(e2eEnv.DATABASE_URL).toContain("watchdog_e2e");
    expect(e2eEnv.S3_ENDPOINT).toBe(testHttpOrigin("127.0.0.1:9100", ""));
  });

  it("respects shell overrides for E2E_WEB_PORT", async () => {
    process.env.E2E_WEB_PORT = "4400";
    process.env.BETTER_AUTH_URL = testHttpOrigin("127.0.0.1:4400", "");

    const { e2eEnv, e2eOrigin } = await import("./env");

    expect(e2eOrigin).toBe(testHttpOrigin("127.0.0.1:4400", ""));
    expect(e2eEnv.BETTER_AUTH_URL).toBe(testHttpOrigin("127.0.0.1:4400", ""));
  });

  it("e2eWebServerEnv merges inherited process env with e2e defaults", async () => {
    process.env.CUSTOM_E2E_FLAG = "yes";

    const { e2eEnv, e2eWebServerEnv } = await import("./env");
    const merged = e2eWebServerEnv();

    expect(merged.CUSTOM_E2E_FLAG).toBe("yes");
    expect(merged.DATABASE_URL).toBe(e2eEnv.DATABASE_URL);
  });
});
