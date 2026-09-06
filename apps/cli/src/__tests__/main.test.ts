import { describe, expect, it, vi } from "vitest";

const cliMocks = vi.hoisted(() => ({
  emit: vi.fn(),
}));

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    api: vi.fn(() => ({
      cases: { list: vi.fn().mockResolvedValue([{ id: "case-1" }]) },
    })),
    emit: cliMocks.emit,
    wrapCommandTree: (command: unknown) => command,
  };
});

vi.mock("../env", () => ({
  loadCliEnv: vi.fn(),
}));

import { wdMain } from "../main";

describe("wdMain", () => {
  it("emits the root command index when invoked without a subcommand", async () => {
    await wdMain.run?.({ args: {} } as never);

    expect(cliMocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        bin: "wd",
        count: 1,
        commands: expect.arrayContaining(["cases", "jobs", "proposals"]),
      })
    );
  });
});
