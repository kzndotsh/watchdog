import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const resetE2eDbKit = vi.fn(async () => {});

vi.mock("@watchdog/test-kit/db", () => ({
  resetE2eDb: resetE2eDbKit,
}));

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetE2eDbKit.mockClear();
  vi.resetModules();
});

describe("e2e db-reset", () => {
  it("truncates public + auth via test-kit resetE2eDb", async () => {
    const { resetE2eDb } = await import("./db-reset");
    await resetE2eDb();
    expect(resetE2eDbKit).toHaveBeenCalledOnce();
  });
});
