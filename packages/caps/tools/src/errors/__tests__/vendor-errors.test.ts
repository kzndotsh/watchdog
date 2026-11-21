import { describe, expect, it } from "vitest";

import {
  AbortedError,
  HttpVendorError,
  MissingCredentialError,
  ParseVendorError,
  RateLimitedError,
  ValidationVendorError,
} from "../tagged-errors";
import {
  abortedError,
  errorMessage,
  httpVendorError,
  parseVendorError,
  validationVendorError,
} from "../vendor-errors";

describe("vendor errors", () => {
  it("constructors return the tagged error with its stable code", () => {
    expect(httpVendorError("Example", 502)).toBeInstanceOf(HttpVendorError);
    expect(httpVendorError("Example", 502).code).toBe("vendor_http");
    expect(new MissingCredentialError({ slot: "TEST_KEY" })).toBeInstanceOf(
      MissingCredentialError
    );
    expect(new MissingCredentialError({ slot: "TEST_KEY" }).code).toBe(
      "missing_credential"
    );
    expect(
      new RateLimitedError({ service: "Svc", subject: "x" })
    ).toBeInstanceOf(RateLimitedError);
    expect(new RateLimitedError({ service: "Svc", subject: "x" }).code).toBe(
      "rate_limited"
    );
    expect(parseVendorError("Svc", "x")).toBeInstanceOf(ParseVendorError);
    expect(validationVendorError("bad")).toBeInstanceOf(ValidationVendorError);
    expect(abortedError("stop")).toBeInstanceOf(AbortedError);
    expect(abortedError("stop").code).toBe("aborted");
  });

  it("every vendor code is distinct", () => {
    const codes = [
      httpVendorError("a", 500),
      new MissingCredentialError({ slot: "a" }),
      new RateLimitedError({ service: "a", subject: "b" }),
      parseVendorError("a", "b"),
      validationVendorError("a"),
      abortedError("a"),
    ].map((error) => error.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("derives messages from fields, with an optional detail override", () => {
    expect(httpVendorError("Shodan", 401).message).toBe("Shodan HTTP 401");
    expect(httpVendorError("Shodan", 401, "key rejected").message).toBe(
      "key rejected"
    );
    expect(
      new RateLimitedError({ service: "Censys", subject: "8.8.8.8" }).message
    ).toBe("Censys rate-limited for 8.8.8.8");
    expect(new MissingCredentialError({ slot: "SHODAN_API_KEY" }).message).toBe(
      "SHODAN_API_KEY required"
    );
    expect(parseVendorError("Svc", "q").message).toBe(
      "Svc response for q was not a JSON object"
    );
  });

  it("errorMessage stringifies unknown values", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });
});
