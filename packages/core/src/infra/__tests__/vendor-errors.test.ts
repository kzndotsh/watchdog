import { describe, expect, it } from "vitest";

import {
  HttpVendorError,
  MissingCredentialError,
  ParseVendorError,
  RateLimitedError,
  ValidationVendorError,
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
});
