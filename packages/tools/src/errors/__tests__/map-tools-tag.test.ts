import { describe, expect, it } from "vitest";

import { mapToolsCatch, taggedToToolsError } from "../map-tools-tag";
import {
  HttpVendorError,
  MissingCredentialError,
  RateLimitedError,
  ValidationVendorError,
} from "../tagged-errors";
import {
  httpToolsError,
  missingApiKey,
  rateLimitedToolsError,
  ToolsError,
} from "../tools-error";

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
  });

  it("round-trips structured rate_limited ToolsError fields", () => {
    const mapped = mapToolsCatch(rateLimitedToolsError("Censys", "8.8.8.8"));
    expect(mapped).toBeInstanceOf(RateLimitedError);
    expect(mapped).toMatchObject({ service: "Censys", subject: "8.8.8.8" });
  });

  it("round-trips structured http_error ToolsError fields", () => {
    const mapped = mapToolsCatch(httpToolsError("Shodan", 401));
    expect(mapped).toBeInstanceOf(HttpVendorError);
    expect(mapped).toMatchObject({ service: "Shodan", status: 401 });
  });

  it("round-trips missing_api_key ToolsError slot name", () => {
    const mapped = mapToolsCatch(missingApiKey("SHODAN_API_KEY"));
    expect(mapped).toBeInstanceOf(MissingCredentialError);
    expect(mapped).toMatchObject({ slot: "SHODAN_API_KEY" });
  });
});

describe("taggedToToolsError", () => {
  it("preserves validation messages", () => {
    const error = taggedToToolsError(
      new ValidationVendorError({ message: "no bytes" })
    );
    expect(error).toBeInstanceOf(ToolsError);
    expect(error.message).toBe("no bytes");
  });

  it("maps missing credential to missingApiKey", () => {
    const error = taggedToToolsError(
      new MissingCredentialError({ slot: "SHODAN_API_KEY required" })
    );
    expect(error.message).toContain("SHODAN_API_KEY");
  });
});
