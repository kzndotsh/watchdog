import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { authFields, s3Fields, vaultFields } from "../fragments";
import {
  DEV_S3_SECRET,
  GENERATE_SECRET_HINT,
  isPlaceholderSecret,
  MIN_SECRET_LENGTH,
} from "../secrets";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The error messages of one field, or `[]` when the value parses. */
function errorsOf(
  fields: Record<string, z.ZodType>,
  name: string,
  value: string | undefined
): string[] {
  const parsed = z.object(fields).safeParse({ [name]: value });
  return parsed.success
    ? []
    : parsed.error.issues
        .filter((i) => i.path[0] === name)
        .map((i) => i.message);
}

describe("secret placeholders", () => {
  it.each([
    "change-me-to-a-long-random-string-at-least-32",
    "CHANGEME-CHANGEME-CHANGEME-CHANGEME",
    "your-secret-goes-here-0123456789abcdef",
    "replace-me-with-a-real-value-0123456789",
    "secret",
    "Password",
  ])("flags %s", (value) => {
    expect(isPlaceholderSecret(value)).toBe(true);
  });

  it("accepts a generated value", () => {
    expect(
      isPlaceholderSecret("t7Zk0m3q9Yx1pV5uH2bN8cR4sW6dF0gJ1aL3eO5iU7k=")
    ).toBe(false);
  });
});

describe.each([
  ["BETTER_AUTH_SECRET", authFields],
  ["WD_MASTER_VAULT_KEY", vaultFields],
] as const)("%s", (name, fields) => {
  const real = "t7Zk0m3q9Yx1pV5uH2bN8cR4sW6dF0gJ1aL3eO5iU7k=";

  it("accepts a generated 44-character value", () => {
    expect(errorsOf(fields, name, real)).toEqual([]);
  });

  it("accepts exactly the minimum length", () => {
    expect(errorsOf(fields, name, "q".repeat(MIN_SECRET_LENGTH))).toEqual([]);
  });

  it("rejects a value one character short and says how to generate one", () => {
    const [message] = errorsOf(fields, name, "q".repeat(MIN_SECRET_LENGTH - 1));
    expect(message).toContain(name);
    expect(message).toContain(String(MIN_SECRET_LENGTH));
    expect(message).toContain(GENERATE_SECRET_HINT);
  });

  it("rejects a placeholder of valid length and names the variable", () => {
    const messages = errorsOf(
      fields,
      name,
      "change-me-to-a-long-random-string-at-least-32"
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(`${name} is a placeholder`);
    expect(messages[0]).toContain(GENERATE_SECRET_HINT);
  });

  it("says it is required, with the hint, when unset", () => {
    const [message] = errorsOf(fields, name, undefined);
    expect(message).toContain(`${name} is required`);
    expect(message).toContain(GENERATE_SECRET_HINT);
  });

  it("trims padding before it counts", () => {
    expect(errorsOf(fields, name, `  ${"q".repeat(10)}  `)).not.toEqual([]);
  });
});

describe("WD_MASTER_VAULT_KEY rotation hint", () => {
  it("points every refusal at vault-rekey, so a replaced key does not orphan credentials", () => {
    for (const value of [
      undefined,
      "short",
      "change-me-to-a-long-random-string-at-least-32",
    ]) {
      const [message] = errorsOf(vaultFields, "WD_MASTER_VAULT_KEY", value);
      expect(message).toContain("just vault-rekey");
      expect(message).toContain("instead of just replacing the key");
    }
  });

  it("does not add the hint to the auth secret", () => {
    const [message] = errorsOf(authFields, "BETTER_AUTH_SECRET", "short");
    expect(message).not.toContain("vault-rekey");
  });
});

describe("S3_SECRET_KEY", () => {
  it("refuses a placeholder in every environment", () => {
    expect(errorsOf(s3Fields, "S3_SECRET_KEY", "changeme")[0]).toContain(
      "S3_SECRET_KEY is a placeholder"
    );
  });

  it("allows the development default outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(errorsOf(s3Fields, "S3_SECRET_KEY", DEV_S3_SECRET)).toEqual([]);
    vi.stubEnv("NODE_ENV", "test");
    expect(errorsOf(s3Fields, "S3_SECRET_KEY", DEV_S3_SECRET)).toEqual([]);
  });

  it("refuses the development default in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const [message] = errorsOf(s3Fields, "S3_SECRET_KEY", DEV_S3_SECRET);
    expect(message).toContain("development default");
    expect(
      errorsOf(s3Fields, "S3_SECRET_KEY", "real-store-secret-9f3a")
    ).toEqual([]);
  });
});
