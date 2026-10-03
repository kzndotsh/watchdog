import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import {
  CONFIRMED_REFUSED_MESSAGE,
  USER_OVERRIDE_REQUIRED_MESSAGE,
} from "@watchdog/policy";

import { refuseConfirmed, requireUserOverride } from "../custody";

/** Guard: the API transport maps the shared policy violation; it owns no message text. */
function caught(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("api custody uses the shared child-write messages", () => {
  it("requireUserOverride throws FORBIDDEN with the shared message", () => {
    const error = caught(() => {
      requireUserOverride(undefined);
    });
    expect(error).toBeInstanceOf(ORPCError);
    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: USER_OVERRIDE_REQUIRED_MESSAGE,
    });
  });

  it("refuseConfirmed throws FORBIDDEN with the shared message", () => {
    const error = caught(() => {
      refuseConfirmed("confirmed");
    });
    expect(error).toBeInstanceOf(ORPCError);
    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: CONFIRMED_REFUSED_MESSAGE,
    });
  });
});
