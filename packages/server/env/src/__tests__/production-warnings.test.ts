import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { databaseFields, s3Fields } from "../fragments";
import {
  assertValidationNotSkipped,
  isLocalHost,
  transportWarnings,
} from "../production-warnings";
import { isProductionDbPlaceholder } from "../secrets";

afterEach(() => {
  vi.unstubAllEnvs();
});

const prod = { NODE_ENV: "production" } as const;

describe("isLocalHost", () => {
  it.each([
    "localhost",
    "app.localhost",
    "127.0.0.1",
    "127.4.5.6",
    "::1",
    "[::1]",
    "::ffff:127.0.0.1",
    "[::ffff:7f00:1]",
    "postgres",
    "seaweedfs",
  ])("treats %s as local", (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  it.each([
    "db.example.com",
    "10.0.0.5",
    "192.168.1.2",
    "2001:db8::1",
    "[::ffff:a00:5]",
  ])("treats %s as non-local", (host) => {
    expect(isLocalHost(host)).toBe(false);
  });
});

describe("transportWarnings", () => {
  it("warns about a non-local database without sslmode, naming the variable and not the password", () => {
    const warnings = transportWarnings({
      ...prod,
      DATABASE_URL: "postgres://app:s3cr3tpw@db.example.com:5432/wd",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("DATABASE_URL");
    expect(warnings[0]).not.toContain("s3cr3tpw");
  });

  it.each(["disable", "allow", "prefer"])("warns for sslmode=%s", (mode) => {
    expect(
      transportWarnings({
        ...prod,
        DATABASE_URL: `postgres://app:pw@db.example.com/wd?sslmode=${mode}`,
      })
    ).toHaveLength(1);
  });

  it.each(["require", "verify-full"])("accepts sslmode=%s", (mode) => {
    expect(
      transportWarnings({
        ...prod,
        DATABASE_URL: `postgres://app:pw@db.example.com/wd?sslmode=${mode}`,
      })
    ).toEqual([]);
  });

  it("does not warn for a local or compose-service database", () => {
    for (const host of ["127.0.0.1", "localhost", "postgres"]) {
      expect(
        transportWarnings({
          ...prod,
          DATABASE_URL: `postgres://app:pw@${host}:5432/wd`,
        })
      ).toEqual([]);
    }
  });

  it.each([
    "BETTER_AUTH_URL",
    "S3_ENDPOINT",
    "S3_PUBLIC_URL",
    "WD_OTLP_ENDPOINT",
  ])("warns about an http: %s on a non-local host only", (name) => {
    const warnings = transportWarnings({
      ...prod,
      [name]: "http://app.example.com/x",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(name);
    expect(
      transportWarnings({ ...prod, [name]: "https://app.example.com/x" })
    ).toEqual([]);
    expect(
      transportWarnings({ ...prod, [name]: "http://127.0.0.1:3000" })
    ).toEqual([]);
  });

  it("warns about an http: error-reporting DSN without leaking its key", () => {
    const warnings = transportWarnings({
      ...prod,
      WD_ERROR_REPORTING_DSN: "http://publickey@errors.example.com/1",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("WD_ERROR_REPORTING_DSN");
    expect(warnings[0]).not.toContain("publickey");
  });

  it("returns one warning per offending setting, and none outside production", () => {
    const source = {
      DATABASE_URL: "postgres://app:pw@db.example.com/wd",
      BETTER_AUTH_URL: "http://wd.example.com",
      S3_ENDPOINT: "http://s3-internal.example.com",
      S3_PUBLIC_URL: "http://s3.example.com",
      WD_OTLP_ENDPOINT: "http://otel.example.com",
      WD_ERROR_REPORTING_DSN: "http://k@errors.example.com/1",
    };
    expect(transportWarnings({ ...prod, ...source })).toHaveLength(6);
    expect(transportWarnings({ NODE_ENV: "development", ...source })).toEqual(
      []
    );
  });
});

describe("assertValidationNotSkipped", () => {
  it("refuses SKIP_ENV_VALIDATION=1 in production", () => {
    expect(() =>
      assertValidationNotSkipped({
        NODE_ENV: "production",
        SKIP_ENV_VALIDATION: "1",
      })
    ).toThrow(/SKIP_ENV_VALIDATION/);
  });

  it("allows it outside production (lint, builds, tests) and production without it", () => {
    expect(() =>
      assertValidationNotSkipped({ NODE_ENV: "test", SKIP_ENV_VALIDATION: "1" })
    ).not.toThrow();
    expect(() =>
      assertValidationNotSkipped({ NODE_ENV: "production" })
    ).not.toThrow();
  });
});

describe("production database and object-store secrets", () => {
  const dbErrors = (url: string) => {
    const parsed = z.object(databaseFields).safeParse({ DATABASE_URL: url });
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  };

  it.each([
    "postgres://watchdog_app:watchdog@db.example.com/wd",
    "postgres://postgres:postgres@db.example.com/wd",
    "postgres://app:change-me@db.example.com/wd",
    "postgres://app:Password@db.example.com/wd",
  ])("refuses %s in production", (url) => {
    vi.stubEnv("NODE_ENV", "production");
    expect(dbErrors(url).join(",")).toContain("DATABASE_URL");
  });

  it("accepts a real password in production and the dev password elsewhere", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(dbErrors("postgres://app:q7Zk2mXv9Lp4@db.example.com/wd")).toEqual(
      []
    );
    vi.stubEnv("NODE_ENV", "development");
    expect(
      dbErrors("postgresql://watchdog_app:watchdog@127.0.0.1:5432/watchdog")
    ).toEqual([]);
  });

  it("exposes the one check the container migrator uses", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(
      isProductionDbPlaceholder(
        "postgres://postgres:postgres@db.example.com/wd"
      )
    ).toBe(true);
    expect(
      isProductionDbPlaceholder(
        "postgres://owner:q7Zk2mXv9Lp4@db.example.com/wd"
      )
    ).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(
      isProductionDbPlaceholder("postgres://postgres:postgres@127.0.0.1/wd")
    ).toBe(false);
  });

  it("refuses the object-store dev secret and placeholders in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const parse = (value: string) =>
      z.object(s3Fields).safeParse({ S3_SECRET_KEY: value }).success;
    expect(parse("watchdog-dev-secret")).toBe(false);
    expect(parse("changeme")).toBe(false);
  });
});
