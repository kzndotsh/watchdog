import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@watchdog/db", () => ({
  db: {},
  jobsRepo: { get },
}));

import { preflightEffect } from "../preflight";

describe("preflightEffect", () => {
  it("stops with not_found for blank job ids without querying", async () => {
    get.mockClear();
    const result = await Effect.runPromise(preflightEffect("   "));
    expect(result).toEqual({ kind: "stop", reason: "not_found" });
    expect(get).not.toHaveBeenCalled();
  });
});
