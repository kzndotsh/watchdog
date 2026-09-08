import { describe, expect, it } from "vitest";
import { z } from "zod";

import { authFields, databaseFields, s3Fields, smtpFields } from "../fragments";

describe("env fragments", () => {
  it("fails closed on a short auth secret", () => {
    const parsed = z.object(authFields).safeParse({
      BETTER_AUTH_SECRET: "too-short",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires DATABASE_URL", () => {
    const parsed = z.object(databaseFields).safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("defaults S3_REGION", () => {
    const parsed = z.object(s3Fields).parse({
      S3_ENDPOINT: "http://127.0.0.1:9100",
      S3_ACCESS_KEY: "minioadmin",
      S3_SECRET_KEY: "minioadmin",
      S3_BUCKET: "watchdog-evidence",
    });
    expect(parsed.S3_REGION).toBe("us-east-1");
  });

  it("treats SMTP as optional", () => {
    const parsed = z.object(smtpFields).safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("trims padded database and auth env strings", () => {
    const db = z.object(databaseFields).parse({
      DATABASE_URL: "  postgresql://localhost/watchdog  ",
    });
    expect(db.DATABASE_URL).toBe("postgresql://localhost/watchdog");

    const auth = z.object(authFields).parse({
      BETTER_AUTH_SECRET: "a".repeat(32).padEnd(34, " "),
      BETTER_AUTH_URL: "  http://127.0.0.1:3000  ",
    });
    expect(auth.BETTER_AUTH_SECRET).toHaveLength(32);
    expect(auth.BETTER_AUTH_URL).toBe("http://127.0.0.1:3000");
  });
});
