import { describe, expect, it } from "vitest";

import { mapToolsCatch, taggedToToolsError } from "../map-tools-tag";
import {
  HttpVendorError,
  MissingCredentialError,
  ValidationVendorError,
} from "../tagged-errors";
import { ToolsError } from "../tools-error";

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
