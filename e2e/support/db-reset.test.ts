import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const resetTestDb = vi.fn(async () => {});

vi.mock("@watchdog/test-kit/db", () => ({
  resetTestDb,
}));

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetTestDb.mockClear();
  vi.resetModules();
});

describe("e2e db-reset", () => {
  it("truncates via test-kit resetTestDb", async () => {
    const { resetE2eDb } = await import("./db-reset");
    await resetE2eDb();
    expect(resetTestDb).toHaveBeenCalledOnce();
  });
});
