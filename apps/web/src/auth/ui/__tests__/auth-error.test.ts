import { describe, expect, it } from "vitest";

import { authErrorDetails } from "@/auth/ui/auth-error";
import { formString } from "@/auth/ui/form-data";

describe("authErrorDetails", () => {
  it("reads a Better Auth server error", () => {
    expect(
      authErrorDetails({
        error: { code: "EMAIL_NOT_VERIFIED", message: "Verify first" },
        message: "outer",
      })
    ).toEqual({
      fromServer: true,
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify first",
    });
  });

  it("falls back to the outer message when the server error has none", () => {
    expect(
      authErrorDetails({ error: { code: "X" }, message: "outer" })
    ).toEqual({ fromServer: true, code: "X", message: "outer" });
  });

  it("reads a thrown Error as not from the server", () => {
    expect(authErrorDetails(new Error("boom"))).toEqual({
      fromServer: false,
      code: undefined,
      message: "boom",
    });
  });

  it("tolerates non-objects", () => {
    expect(authErrorDetails("nope")).toEqual({
      fromServer: false,
      code: undefined,
      message: undefined,
    });
    expect(authErrorDetails(null).fromServer).toBe(false);
  });
});

describe("formString", () => {
  it("returns text fields and '' for missing or file values", () => {
    const data = new FormData();
    data.set("email", "a@example.com");
    data.set("upload", new File(["x"], "x.txt"));
    expect(formString(data, "email")).toBe("a@example.com");
    expect(formString(data, "missing")).toBe("");
    expect(formString(data, "upload")).toBe("");
  });
});
