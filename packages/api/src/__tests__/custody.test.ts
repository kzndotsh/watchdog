import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import {
  assertAgentChildWriteCustody,
  refuseConfirmed,
  requireUserOverride,
} from "../custody";

describe("custody", () => {
  it("requireUserOverride rejects missing override", () => {
    expect(() => {
      requireUserOverride(false);
    }).toThrow(ORPCError);
    expect(() => {
      requireUserOverride(undefined);
    }).toThrow(ORPCError);
  });

  it("requireUserOverride accepts literal true", () => {
    expect(() => {
      requireUserOverride(true);
    }).not.toThrow();
  });

  it("refuseConfirmed rejects confirmed", () => {
    expect(() => {
      refuseConfirmed("confirmed");
    }).toThrow(ORPCError);
  });

  it("refuseConfirmed allows other tiers", () => {
    expect(() => {
      refuseConfirmed("unverified");
    }).not.toThrow();
    expect(() => {
      refuseConfirmed("possible");
    }).not.toThrow();
    expect(() => {
      refuseConfirmed(undefined);
    }).not.toThrow();
  });

  it("assertAgentChildWriteCustody skips session auth", () => {
    expect(() => {
      assertAgentChildWriteCustody({ confidence: "confirmed" }, "session");
    }).not.toThrow();
  });

  it("assertAgentChildWriteCustody enforces override and confirmed for apiKey", () => {
    expect(() => {
      assertAgentChildWriteCustody({ confidence: "unverified" }, "apiKey");
    }).toThrow(ORPCError);

    expect(() => {
      assertAgentChildWriteCustody(
        { confidence: "confirmed", userOverride: true },
        "apiKey"
      );
    }).toThrow(ORPCError);

    expect(() => {
      assertAgentChildWriteCustody(
        { confidence: "unverified", userOverride: true },
        "apiKey"
      );
    }).not.toThrow();
  });
});
