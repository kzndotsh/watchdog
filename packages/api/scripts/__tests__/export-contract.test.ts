import { beforeEach, describe, expect, it, vi } from "vitest";

const exportContract = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../../src/export-contract.ts", () => ({
  exportContract,
}));

describe("export-contract script entry", () => {
  // The script runs on import: re-evaluate it so each test (and repeat) sees its own call.
  beforeEach(() => {
    vi.resetModules();
  });

  it("invokes exportContract for the client generated directory", async () => {
    await import("../export-contract.ts");
    expect(exportContract).toHaveBeenCalledTimes(1);
  });
});
