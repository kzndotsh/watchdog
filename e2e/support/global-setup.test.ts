import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("e2e global-setup", () => {
  it("seeds e2e env for the test runner process", async () => {
    delete process.env.DATABASE_URL;

    const globalSetup = (await import("./global-setup")).default;
    await globalSetup();

    expect(process.env.DATABASE_URL).toContain("watchdog_e2e");
    expect(process.env.E2E_WEB_PORT).toBe("3300");
  });
});
