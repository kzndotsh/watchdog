import { describe, expect, it } from "vitest";

import {
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
