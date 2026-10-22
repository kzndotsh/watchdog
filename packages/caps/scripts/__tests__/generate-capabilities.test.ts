import { beforeEach, describe, expect, it, vi } from "vitest";

const writeCapabilitiesGenFile = vi.hoisted(() => vi.fn(() => 3));
const writeCapRegisterFile = vi.hoisted(() => vi.fn());

vi.mock("../../src/write-capabilities-gen.ts", () => ({
  writeCapabilitiesGenFile,
  writeCapRegisterFile,
}));

describe("generate-capabilities script entry", () => {
  // The script runs on import: re-evaluate it so each test (and repeat) sees its own call.
  beforeEach(() => {
    vi.resetModules();
  });

  it("writes capabilities.gen.json via shared helper", async () => {
    await import("../generate-capabilities.ts");
    expect(writeCapabilitiesGenFile).toHaveBeenCalledTimes(1);
  });

  it("writes the Cap register under docs/reference/platform", async () => {
    await import("../generate-capabilities.ts");
    const [outPath] = writeCapRegisterFile.mock.calls.at(-1) ?? [];
    expect(String(outPath)).toMatch(
      /docs\/reference\/platform\/cap-register\.md$/
    );
  });
});
