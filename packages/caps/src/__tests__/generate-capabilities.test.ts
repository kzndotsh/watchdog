import { describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  ...fsMocks,
}));

import { writeCapabilitiesGenFile } from "../write-capabilities-gen";

describe("writeCapabilitiesGenFile", () => {
  it("writes CapDescriptor JSON for all registered caps", () => {
    const count = writeCapabilitiesGenFile("/tmp/capabilities.gen.json");

    expect(count).toBeGreaterThan(0);
    expect(fsMocks.writeFileSync).toHaveBeenCalledTimes(1);
    const payload = fsMocks.writeFileSync.mock.calls[0]?.[1];
    expect(JSON.parse(String(payload))).toEqual(expect.any(Array));
  });
});
