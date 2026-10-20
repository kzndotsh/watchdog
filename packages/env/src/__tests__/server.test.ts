import { describe, expect, it, vi } from "vitest";

vi.mock("@t3-oss/env-core", () => ({
  createEnv: vi.fn(() => ({
    DATABASE_URL: "postgres://app:pw@db/wd",
    BETTER_AUTH_URL: "http://127.0.0.1:3000",
    BETTER_AUTH_SECRET: "a-long-auth-secret-0123456789abcdef",
    WD_ERROR_REPORTING_DSN: "https://key@errors.example.test/1",
    WD_RELEASE: "1.2.3",
    WD_OTLP_ENDPOINT: "https://otlp.example.test",
    WD_OTLP_HEADERS: "x-key=otlp-header-secret",
    NODE_ENV: "production",
  })),
}));

describe("server env entrypoint", () => {
  it("exports validated env from createEnv", async () => {
    const { env } = await import("../server");
    expect(env.DATABASE_URL).toBe("postgres://app:pw@db/wd");
  });

  it("lists only the values of sensitive fields, for scrubbing", async () => {
    const { sensitiveEnvValues } = await import("../server");
    const values = sensitiveEnvValues();
    expect(values).toContain("postgres://app:pw@db/wd");
    expect(values).toContain("a-long-auth-secret-0123456789abcdef");
    expect(values).toContain("https://key@errors.example.test/1");
    expect(values).not.toContain("http://127.0.0.1:3000");
    expect(values).not.toContain("1.2.3");
    expect(values).toContain("https://otlp.example.test");
    expect(values).toContain("x-key=otlp-header-secret");
  });

  it("hands the logger the DSN, release, environment and secrets", async () => {
    const { errorReportingSettings } = await import("../server");
    expect(errorReportingSettings()).toMatchObject({
      dsn: "https://key@errors.example.test/1",
      release: "1.2.3",
      environment: "production",
    });
  });

  it("hands the logger the raw OTLP settings, release, environment and secrets", async () => {
    const { otlpSettings } = await import("../server");
    expect(otlpSettings()).toMatchObject({
      endpoint: "https://otlp.example.test",
      headers: "x-key=otlp-header-secret",
      release: "1.2.3",
      environment: "production",
    });
    expect(otlpSettings().secrets).toContain("x-key=otlp-header-secret");
  });
});
