import { describe, expect, it, vi } from "vitest";

import {
  CONFIRMED_REFUSED_MESSAGE,
  USER_OVERRIDE_REQUIRED_MESSAGE,
} from "@watchdog/policy";

import {
  parseOptionalConfidence,
  refuseConfirmed,
  requireUserOverride,
} from "../custody";
import { failureOf } from "./stand-in-api";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

describe("custody helpers", () => {
  it("requireUserOverride fails CUSTODY with the shared message when override is disabled", async () => {
    const failure = await failureOf(() => {
      requireUserOverride(false);
    });
    expect(failure.exitCode).toBe(1);
    expect(failure.error.code).toBe("CUSTODY");
    expect(failure.error.message).toBe(USER_OVERRIDE_REQUIRED_MESSAGE);
    expect(failure.help?.length).toBeGreaterThan(0);
  });

  it("requireUserOverride passes when override is enabled", () => {
    expect(() => {
      requireUserOverride(true);
    }).not.toThrow();
  });

  it("refuseConfirmed fails CUSTODY with the shared message for the confirmed tier", async () => {
    const failure = await failureOf(() => {
      refuseConfirmed("confirmed");
    });
    expect(failure.error.code).toBe("CUSTODY");
    expect(failure.error.message).toBe(CONFIRMED_REFUSED_MESSAGE);
  });

  it("refuseConfirmed lets the lower tiers through", () => {
    expect(() => {
      refuseConfirmed("unverified");
      refuseConfirmed("possible");
      refuseConfirmed(undefined);
    }).not.toThrow();
  });

  it("parseOptionalConfidence returns undefined for omitted values", () => {
    expect(parseOptionalConfidence(undefined)).toBeUndefined();
    expect(parseOptionalConfidence("")).toBeUndefined();
    expect(parseOptionalConfidence("   ")).toBeUndefined();
  });

  it("parseOptionalConfidence parses provided tiers", () => {
    expect(parseOptionalConfidence("unverified")).toBe("unverified");
  });

  it("parseOptionalConfidence rejects invalid tiers with USAGE", async () => {
    const failure = await failureOf(() => parseOptionalConfidence("bogus"));
    expect(failure.error.code).toBe("USAGE");
  });
});
