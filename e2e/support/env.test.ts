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
    delete process.env.E2E_S3_PORT;
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_MIGRATE;

    const { e2eEnv, e2eOrigin } = await import("./env");

    expect(e2eOrigin).toBe(testHttpOrigin("127.0.0.1:3300", ""));
    expect(e2eEnv.E2E_WEB_PORT).toBe("3300");
    expect(e2eEnv.DATABASE_URL).toContain("watchdog_e2e");
    expect(e2eEnv.S3_ENDPOINT).toBe(testHttpOrigin("127.0.0.1:9100", ""));
  });

  it("respects shell overrides for E2E_WEB_PORT", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_MIGRATE;
    process.env.E2E_WEB_PORT = "4400";
    process.env.BETTER_AUTH_URL = testHttpOrigin("127.0.0.1:4400", "");

    const { e2eEnv, e2eOrigin } = await import("./env");

    expect(e2eOrigin).toBe(testHttpOrigin("127.0.0.1:4400", ""));
    expect(e2eEnv.BETTER_AUTH_URL).toBe(testHttpOrigin("127.0.0.1:4400", ""));
  });

  it("e2eWebServerEnv merges inherited process env with e2e defaults", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_MIGRATE;
    process.env.CUSTOM_E2E_FLAG = "yes";

    const { e2eEnv, e2eWebServerEnv } = await import("./env");
    const merged = e2eWebServerEnv();

    expect(merged.CUSTOM_E2E_FLAG).toBe("yes");
    expect(merged.DATABASE_URL).toBe(e2eEnv.DATABASE_URL);
  });

  it("loads with a dev DATABASE_URL (listing tests touches no database)", async () => {
    process.env.DATABASE_URL =
      "postgresql://watchdog_app:pw@127.0.0.1:5432/watchdog";

    const { e2eEnv } = await import("./env");

    expect(e2eEnv.DATABASE_URL).toContain("/watchdog");
  });

  it("assertE2eDatabases accepts databases whose name contains e2e", async () => {
    const { assertE2eDatabases } = await import("./env");

    expect(() =>
      assertE2eDatabases({
        DATABASE_URL: "postgresql://a:b@127.0.0.1:5432/watchdog_e2e_ci",
        DATABASE_URL_MIGRATE: "postgresql://a:b@127.0.0.1:5432/watchdog_e2e",
      })
    ).not.toThrow();
  });

  it("assertE2eDatabases refuses the dev database for either URL", async () => {
    const { assertE2eDatabases } = await import("./env");
    const e2e = "postgresql://a:b@127.0.0.1:5432/watchdog_e2e";
    const dev = "postgresql://a:b@127.0.0.1:5432/watchdog";

    expect(() =>
      assertE2eDatabases({ DATABASE_URL: dev, DATABASE_URL_MIGRATE: e2e })
    ).toThrow('DATABASE_URL names the database "watchdog", not an e2e one');
    expect(() =>
      assertE2eDatabases({ DATABASE_URL: e2e, DATABASE_URL_MIGRATE: dev })
    ).toThrow('DATABASE_URL_MIGRATE names the database "watchdog"');
  });

  it("assertE2eDatabases names an unparseable URL as such", async () => {
    const { assertE2eDatabases } = await import("./env");

    expect(() =>
      assertE2eDatabases({
        DATABASE_URL: "not a url",
        DATABASE_URL_MIGRATE: "postgresql://a:b@127.0.0.1:5432/watchdog_e2e",
      })
    ).toThrow("DATABASE_URL is not a Postgres URL with a database name");
  });
});
