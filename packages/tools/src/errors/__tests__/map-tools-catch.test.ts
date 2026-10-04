import { describe, expect, it } from "vitest";

import { isToolsTag, mapToolsCatch } from "../map-tools-catch";
import {
  AbortedError,
  HttpVendorError,
  MissingCredentialError,
  RateLimitedError,
  ValidationVendorError,
} from "../tagged-errors";
import {
  httpVendorError,
  missingCredentialError,
  rateLimitedVendorError,
} from "../vendor-errors";

describe("mapToolsCatch", () => {
  it("keeps tagged vendor errors", () => {
    const error = new HttpVendorError({ service: "Shodan", status: 401 });
    expect(mapToolsCatch(error)).toBe(error);
  });

  it("maps thrown Error to ValidationVendorError", () => {
    const mapped = mapToolsCatch(new Error("no bytes"));
    expect(mapped).toBeInstanceOf(ValidationVendorError);
    expect(mapped).toMatchObject({ message: "no bytes" });
  });

  it("rethrows abort-like errors", () => {
    const abort = new DOMException("aborted", "AbortError");
    expect(() => mapToolsCatch(abort)).toThrow(abort);
    const aborted = new AbortedError({ message: "stop" });
    expect(() => mapToolsCatch(aborted)).toThrow(aborted);
  });

  it("rethrows non-Error values as defects", () => {
    expect(() => mapToolsCatch("plain")).toThrow("plain");
  });

  it("keeps rate-limited fields exactly, whatever the message says", () => {
    const mapped = mapToolsCatch(rateLimitedVendorError("Censys", "8.8.8.8"));
    expect(mapped).toBeInstanceOf(RateLimitedError);
    expect(mapped).toMatchObject({ service: "Censys", subject: "8.8.8.8" });
  });

  it("classifies by class, not by wording", () => {
    // Text that looks like another tag's message must not change the class.
    const looksLikeRateLimit = new Error("Censys rate-limited for 8.8.8.8");
    expect(mapToolsCatch(looksLikeRateLimit)).toBeInstanceOf(
      ValidationVendorError
    );
    const looksLikeMissingKey = new Error("SHODAN_API_KEY required");
    expect(mapToolsCatch(looksLikeMissingKey)).toBeInstanceOf(
      ValidationVendorError
    );
  });

  it("keeps the tag when the message is reworded", () => {
    const http = httpVendorError("Shodan", 401, "a completely different text");
    expect(mapToolsCatch(http)).toMatchObject({
      _tag: "HttpVendorError",
      service: "Shodan",
      status: 401,
    });
    const slot = missingCredentialError("SHODAN_API_KEY");
    expect(mapToolsCatch(slot)).toBeInstanceOf(MissingCredentialError);
    expect(mapToolsCatch(slot)).toMatchObject({ slot: "SHODAN_API_KEY" });
  });

  it("isToolsTag recognizes the five vendor tags only", () => {
    expect(isToolsTag(httpVendorError("a", 500))).toBe(true);
    expect(isToolsTag(new AbortedError({ message: "x" }))).toBe(false);
    expect(isToolsTag(new Error("x"))).toBe(false);
  });
});
