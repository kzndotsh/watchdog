import { describe, expect, it, vi } from "vitest";

import {
  CONFIRMED_REFUSED_MESSAGE,
  USER_OVERRIDE_REQUIRED_MESSAGE,
} from "@watchdog/policy";

const fail = vi.hoisted(() =>
  vi.fn((code: string, message: string): never => {
    throw new Error(`${code}: ${message}`);
  })
);
vi.mock("../io", () => ({ fail }));

import { refuseConfirmed, requireUserOverride } from "../custody";

/** Guard: the CLI transport maps the shared policy violation; it owns no message text. */
describe("cli custody uses the shared child-write messages", () => {
  it("requireUserOverride fails CUSTODY with the shared message", () => {
    fail.mockClear();
    expect(() => {
      requireUserOverride(false);
    }).toThrow();
    expect(fail).toHaveBeenCalledWith(
      "CUSTODY",
      USER_OVERRIDE_REQUIRED_MESSAGE,
      expect.anything()
    );
  });

  it("refuseConfirmed fails CUSTODY with the shared message", () => {
    fail.mockClear();
    expect(() => {
      refuseConfirmed("confirmed");
    }).toThrow();
    expect(fail).toHaveBeenCalledWith(
      "CUSTODY",
      CONFIRMED_REFUSED_MESSAGE,
      expect.anything()
    );
  });
});
