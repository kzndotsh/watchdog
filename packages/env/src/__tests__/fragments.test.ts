import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseAiPrivateOrigins } from "../ai-origins";
import { parseEgressProxyUrl } from "../egress-proxy";
import {
  authFields,
  allEnvFields,
  databaseFields,
  egressFields,
  s3Fields,
  smtpFields,
} from "../fragments";

describe("env fragments", () => {
  it("parses WD_BREACH_CAPS as off, safe or full, defaulting to off, and rejects anything else", () => {
    const schema = z.object({ WD_BREACH_CAPS: allEnvFields.WD_BREACH_CAPS });
    expect(schema.parse({})).toEqual({ WD_BREACH_CAPS: "off" });
    for (const mode of ["off", "safe", "full"] as const) {
      expect(schema.parse({ WD_BREACH_CAPS: mode })).toEqual({
        WD_BREACH_CAPS: mode,
      });
    }
    for (const bad of ["1", "true", "on", "FULL", ""]) {
      const parsed = schema.safeParse({ WD_BREACH_CAPS: bad });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe(
        "WD_BREACH_CAPS must be off, safe or full"
      );
    }
  });

  it("accepts any bounded text as the error reporting DSN, so a typo cannot block startup", () => {
    const schema = z.object({
      WD_ERROR_REPORTING_DSN: allEnvFields.WD_ERROR_REPORTING_DSN,
    });
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.parse({ WD_ERROR_REPORTING_DSN: "  not a dsn  " })).toEqual({
      WD_ERROR_REPORTING_DSN: "not a dsn",
    });
    expect(
      schema.safeParse({ WD_ERROR_REPORTING_DSN: "x".repeat(5000) }).success
    ).toBe(false);
  });

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
      S3_ACCESS_KEY: "watchdog",
      S3_SECRET_KEY: "watchdog-dev-secret",
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

  it("treats the egress proxy as optional and accepts only http(s) URLs", () => {
    const schema = z.object(egressFields);
    expect(schema.safeParse({}).success).toBe(true);
    expect(
      schema.parse({ WD_EGRESS_PROXY: " http://proxy.internal:3128 " })
        .WD_EGRESS_PROXY
    ).toBe("http://proxy.internal:3128");
    expect(
      schema.safeParse({ WD_EGRESS_PROXY: "socks5://127.0.0.1:1080" }).success
    ).toBe(false);
  });

  it("lists the local model address as the only private AI origin by default", () => {
    const schema = z.object(egressFields);
    expect(schema.parse({}).WD_AI_PRIVATE_ORIGINS).toBe(
      "http://127.0.0.1:8080"
    );
    expect(
      schema.parse({
        WD_AI_PRIVATE_ORIGINS: " http://10.0.0.5:9000 , https://llm.lan ",
      }).WD_AI_PRIVATE_ORIGINS
    ).toBe("http://10.0.0.5:9000 , https://llm.lan");
    expect(schema.parse({ WD_AI_PRIVATE_ORIGINS: "none" })).toMatchObject({
      WD_AI_PRIVATE_ORIGINS: "none",
    });
    expect(
      schema.safeParse({ WD_AI_PRIVATE_ORIGINS: "http://10.0.0.5/v1" }).success
    ).toBe(false);
    expect(
      schema.safeParse({ WD_AI_PRIVATE_ORIGINS: "10.0.0.5:9000" }).success
    ).toBe(false);
  });

  it("parses the AI private origin list in one place: normalized origins, or none", () => {
    expect(
      parseAiPrivateOrigins("http://127.0.0.1:8080, HTTPS://Llm.LAN:443")
    ).toEqual(["http://127.0.0.1:8080", "https://llm.lan"]);
    expect(parseAiPrivateOrigins("none")).toEqual([]);
    expect(parseAiPrivateOrigins("http://u:p@10.0.0.5")).toBeNull();
    expect(parseAiPrivateOrigins("ftp://10.0.0.5")).toBeNull();
    expect(parseAiPrivateOrigins("http://10.0.0.5, nonsense")).toBeNull();
  });

  it("parses the egress proxy in one place for the schema and the client", () => {
    expect(parseEgressProxyUrl(" http://p.internal:3128 ")?.host).toBe(
      "p.internal:3128"
    );
    expect(
      parseEgressProxyUrl("https://user:pw@p.internal:3128")
    ).not.toBeNull();
    expect(parseEgressProxyUrl("socks5://127.0.0.1:1080")).toBeNull();
    expect(parseEgressProxyUrl("not a url")).toBeNull();
  });
});
