import { describe, expect, it } from "vitest";

import {
  adminDisplayName,
  checkAdminEmail,
  checkAdminPassword,
  firstLine,
  generateAdminPassword,
  MIN_ADMIN_PASSWORD_LENGTH,
  parseBootstrapAdminArgs,
} from "../bootstrap-admin-args";

describe("parseBootstrapAdminArgs", () => {
  it("reads flags with a value, with =, and the boolean flags", () => {
    expect(
      parseBootstrapAdminArgs([
        "--email",
        "a@b.test",
        "--name=Ada L",
        "--password-stdin",
      ])
    ).toEqual({
      ok: true,
      args: {
        email: "a@b.test",
        name: "Ada L",
        passwordStdin: true,
        printPassword: false,
        help: false,
      },
    });
  });

  it("reads --print-password", () => {
    expect(parseBootstrapAdminArgs(["--print-password"])).toMatchObject({
      ok: true,
      args: { printPassword: true },
    });
  });

  it("accepts no arguments at all", () => {
    expect(parseBootstrapAdminArgs([])).toEqual({
      ok: true,
      args: {
        email: undefined,
        name: undefined,
        passwordStdin: false,
        printPassword: false,
        help: false,
      },
    });
  });

  it("rejects an unknown flag and a flag missing its value", () => {
    expect(parseBootstrapAdminArgs(["--password", "x"])).toMatchObject({
      ok: false,
      message: "unknown argument: --password",
    });
    expect(parseBootstrapAdminArgs(["--email"])).toMatchObject({
      ok: false,
      message: "--email needs a value",
    });
    expect(
      parseBootstrapAdminArgs(["--email", "--password-stdin"])
    ).toMatchObject({ ok: false });
  });
});

describe("input checks", () => {
  it("rejects a malformed email and trims a good one", () => {
    expect(checkAdminEmail("not-an-email")).toMatchObject({ ok: false });
    expect(checkAdminEmail("  Admin@Example.test ")).toEqual({
      ok: true,
      email: "Admin@Example.test",
    });
  });

  it("rejects a short or overlong password", () => {
    expect(
      checkAdminPassword("x".repeat(MIN_ADMIN_PASSWORD_LENGTH - 1))
    ).toMatchObject({ ok: false });
    expect(checkAdminPassword("x".repeat(129))).toMatchObject({ ok: false });
    expect(checkAdminPassword("x".repeat(MIN_ADMIN_PASSWORD_LENGTH))).toEqual({
      ok: true,
    });
  });

  it("names the admin from the email when no name is given", () => {
    expect(adminDisplayName(undefined, "ada@example.test")).toBe("ada");
    expect(adminDisplayName("  ", "ada@example.test")).toBe("ada");
    expect(adminDisplayName(" Ada Lovelace ", "ada@example.test")).toBe(
      "Ada Lovelace"
    );
  });

  it("takes the first line of piped input without its line ending", () => {
    expect(firstLine("hunter2-hunter2\n")).toBe("hunter2-hunter2");
    expect(firstLine("a\r\nb\n")).toBe("a");
    expect(firstLine("")).toBe("");
  });

  it("generates a long URL-safe password that differs every time", () => {
    const a = generateAdminPassword();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(checkAdminPassword(a)).toEqual({ ok: true });
    expect(generateAdminPassword()).not.toBe(a);
  });
});
