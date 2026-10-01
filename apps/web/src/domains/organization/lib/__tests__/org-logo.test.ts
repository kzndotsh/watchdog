import { describe, expect, it } from "vitest";

import {
  logoFileProblem,
  orgInitials,
} from "@/domains/organization/lib/org-logo";

describe("logoFileProblem", () => {
  it("accepts a small image", () => {
    expect(logoFileProblem({ type: "image/png", size: 1000 })).toBeNull();
  });

  it("rejects non-images and oversized files", () => {
    expect(logoFileProblem({ type: "application/pdf", size: 10 })).toBe(
      "Choose an image file"
    );
    expect(logoFileProblem({ type: "image/png", size: 5 * 1024 * 1024 })).toBe(
      "Image must be under 4 MB"
    );
  });
});

describe("orgInitials", () => {
  it("uses the first letter, like the account avatar", () => {
    expect(orgInitials("Acme Investigations Ltd")).toBe("A");
    expect(orgInitials("acme")).toBe("A");
  });

  it("falls back to a question mark", () => {
    expect(orgInitials("   ")).toBe("?");
  });
});
