import { describe, expect, it } from "vitest";

import {
  BlockedTargetError,
  HttpVendorError,
  MissingCredentialError,
  OutboundLimitError,
  ParseVendorError,
  RateLimitedError,
  ValidationVendorError,
  mapToolsCatch,
  type ToolsTag,
} from "@watchdog/tools/errors";

import { InternalError, InvalidError } from "../tagged-errors";
import { toDomainTag } from "../vendor-errors";

describe("toDomainTag", () => {
  it("classifies each vendor tag by tag name", () => {
    expect(
      toDomainTag(new RateLimitedError({ service: "S", subject: "x" }))
    ).toBeInstanceOf(InternalError);
    expect(
      toDomainTag(new HttpVendorError({ service: "S", status: 502 }))
    ).toBeInstanceOf(InternalError);
    expect(
      toDomainTag(new ParseVendorError({ service: "S", subject: "x" }))
    ).toBeInstanceOf(InternalError);
    expect(
      toDomainTag(new MissingCredentialError({ slot: "KEY" }))
    ).toBeInstanceOf(InvalidError);
    expect(
      toDomainTag(new ValidationVendorError({ message: "bad" }))
    ).toBeInstanceOf(InvalidError);
    expect(
      toDomainTag(new BlockedTargetError({ reason: "address" }))
    ).toBeInstanceOf(InvalidError);
    for (const reason of [
      "resolved",
      "proxy",
      "unproxied",
      "undeclared",
      "seed",
    ] as const) {
      expect(toDomainTag(new BlockedTargetError({ reason }))).toBeInstanceOf(
        InternalError
      );
    }
    expect(
      toDomainTag(new OutboundLimitError({ kind: "bytes", limit: 10 }))
    ).toBeInstanceOf(InternalError);
  });

  it("keeps the class when the message is reworded", () => {
    const reworded: ToolsTag[] = [
      new HttpVendorError({ service: "S", status: 500, detail: "anything" }),
      new HttpVendorError({ service: "S", status: 500, detail: "required" }),
      new HttpVendorError({ service: "S", status: 500, detail: "bad input" }),
    ];
    for (const error of reworded) {
      expect(toDomainTag(error)._tag).toBe("InternalError");
    }
    // Text that reads like a missing-credential message stays a validation failure.
    expect(
      toDomainTag(new ValidationVendorError({ message: "KEY required" }))._tag
    ).toBe("InvalidError");
  });

  it("carries the vendor message as the reason and the tag as the cause", () => {
    const vendor = new RateLimitedError({ service: "Censys", subject: "x" });
    const mapped = toDomainTag(vendor);
    expect(mapped.message).toBe("Censys rate-limited for x");
    expect(mapped).toMatchObject({ cause: vendor });
  });

  it("an unexpected tool fault is an InternalError whose detail stays in the cause", () => {
    const driver = new Error("connect ECONNREFUSED 10.0.0.7:5432 (user=boss)");
    const mapped = toDomainTag(mapToolsCatch(driver));
    expect(mapped).toBeInstanceOf(InternalError);
    expect(mapped.message).not.toMatch(/ECONNREFUSED|10\.0\.0\.7/);
    // The original fault itself, not the UnexpectedToolError wrapper.
    expect(mapped).toMatchObject({ cause: driver });
  });

  it("a deliberate tool input failure stays an InvalidError", () => {
    const mapped = toDomainTag(
      mapToolsCatch(new ValidationVendorError({ message: "Invalid URL: x" }))
    );
    expect(mapped).toBeInstanceOf(InvalidError);
  });

  it("keeps ValidationVendorError upstream detail in the cause, not the reason", () => {
    const mapped = toDomainTag(
      new ValidationVendorError({
        message: "oEmbed lookup failed",
        cause: "upstream said: secret-host.internal refused",
      })
    );
    expect(mapped).toBeInstanceOf(InvalidError);
    expect(mapped.message).toBe("oEmbed lookup failed");
    expect(mapped.message).not.toMatch(/secret-host/);
    expect(mapped).toMatchObject({
      cause: "upstream said: secret-host.internal refused",
    });
  });
});
