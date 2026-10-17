import { describe, expect, it } from "vitest";

import {
  OLD_KEY_ENV,
  parseRekeyArgs,
  resolveOldKey,
} from "../vault-rekey-args";

const never = () => {
  throw new Error("stdin must not be read");
};

describe("parseRekeyArgs", () => {
  it("accepts no arguments, --old-key-stdin and --help", () => {
    expect(parseRekeyArgs([])).toEqual({
      ok: true,
      args: { oldKeyStdin: false, help: false },
    });
    expect(parseRekeyArgs(["--old-key-stdin", "-h"])).toEqual({
      ok: true,
      args: { oldKeyStdin: true, help: true },
    });
  });

  it("refuses a key given as an argument, by name, without echoing the value", () => {
    for (const arg of ["--old-key=hunter2", "--new-key=x", "--key=y"]) {
      const parsed = parseRekeyArgs([arg]);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.message).toContain("never passed as arguments");
        expect(parsed.message).not.toContain("hunter2");
      }
    }
  });

  it("refuses an unknown argument", () => {
    expect(parseRekeyArgs(["--force"])).toEqual({
      ok: false,
      message: "unknown argument: --force",
    });
  });
});

describe("resolveOldKey", () => {
  it("reads the environment, trimmed, and accepts a placeholder or short key", () => {
    expect(
      resolveOldKey({
        oldKeyStdin: false,
        env: { [OLD_KEY_ENV]: "  change-me  " },
        readStdin: never,
      })
    ).toEqual({ ok: true, key: "change-me" });
  });

  it("fails when the variable is unset or blank", () => {
    for (const env of [{}, { [OLD_KEY_ENV]: "  " }]) {
      const resolved = resolveOldKey({
        oldKeyStdin: false,
        env,
        readStdin: never,
      });
      expect(resolved.ok).toBe(false);
      if (!resolved.ok) expect(resolved.message).toContain(OLD_KEY_ENV);
    }
  });

  it("reads the first line of stdin with --old-key-stdin, ignoring the environment", () => {
    expect(
      resolveOldKey({
        oldKeyStdin: true,
        env: { [OLD_KEY_ENV]: "from-env" },
        readStdin: () => "from-stdin\nsecond line\n",
      })
    ).toEqual({ ok: true, key: "from-stdin" });
    expect(
      resolveOldKey({ oldKeyStdin: true, env: {}, readStdin: () => "\n" }).ok
    ).toBe(false);
  });
});
