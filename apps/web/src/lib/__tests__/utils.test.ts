import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import {
  errMessage,
  firstNonEmpty,
  messageOr,
  nextAutoSlug,
  slugifyName,
} from "../utils.ts";

describe("slugifyName", () => {
  it("slugifies a display name", () => {
    expect(slugifyName("Ada Lovelace")).toBe("ada-lovelace");
  });
});

describe("nextAutoSlug", () => {
  it("stays in lockstep until the user edits the slug", () => {
    expect(nextAutoSlug("Ada", "ada", "Ada Lovelace")).toBe("ada-lovelace");
    expect(nextAutoSlug("Ada", "custom", "Ada Lovelace")).toBeNull();
  });
});

describe("firstNonEmpty", () => {
  it("skips null, undefined, empty and blank strings", () => {
    expect(firstNonEmpty(null, undefined, "", "  ", "Ada")).toBe("Ada");
  });

  it("returns undefined when nothing has visible characters", () => {
    expect(firstNonEmpty("", null, undefined)).toBeUndefined();
    expect(firstNonEmpty()).toBeUndefined();
  });

  it("keeps the original (untrimmed) value", () => {
    expect(firstNonEmpty(" a ")).toBe(" a ");
  });
});

describe("messageOr", () => {
  it("falls back for missing or empty messages", () => {
    expect(messageOr(undefined, "x")).toBe("x");
    expect(messageOr(null, "x")).toBe("x");
    expect(messageOr("", "x")).toBe("x");
    expect(messageOr("boom", "x")).toBe("boom");
  });
});

describe("errMessage", () => {
  it("shows a user-actionable message for a server failure, never the raw one", () => {
    const server = new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Internal server error",
    });
    expect(errMessage(server, "Couldn't save claim")).toBe(
      "Couldn't save claim. Try again."
    );
  });

  it("recognises a server failure that lost its oRPC class across the wire", () => {
    expect(
      errMessage(new Error("Internal server error"), "Couldn't save claim")
    ).toBe("Couldn't save claim. Try again.");
    expect(
      errMessage(
        { code: "INTERNAL_SERVER_ERROR", status: 500 },
        "Import failed"
      )
    ).toBe("Import failed. Try again.");
  });

  it("keeps caller-fixable and non-error messages unchanged", () => {
    const invalid = new ORPCError("BAD_REQUEST", {
      message: "Name is required",
    });
    expect(errMessage(invalid, "Couldn't save claim")).toBe("Name is required");
    expect(errMessage("weird", "Couldn't save claim")).toBe(
      "Couldn't save claim"
    );
  });
});
