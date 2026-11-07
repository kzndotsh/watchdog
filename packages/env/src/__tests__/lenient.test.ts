import { describe, expect, it } from "vitest";
import { z } from "zod";

import { allEnvFields } from "../fragments";
import { lenientEnv } from "../lenient";

const fields = {
  LIMIT: z.coerce.number().int().min(1).default(100),
  NAME: z.string().min(1).optional(),
  STRICT: z.coerce.number().int().min(10),
};

describe("lenientEnv (validation skipped)", () => {
  it("gives an unset field its schema default", () => {
    expect(lenientEnv(fields, {}).LIMIT).toBe(100);
  });

  it("treats an empty string as unset", () => {
    expect(lenientEnv(fields, { LIMIT: "" }).LIMIT).toBe(100);
  });

  it("parses a set value as validation would", () => {
    expect(lenientEnv(fields, { LIMIT: "7" }).LIMIT).toBe(7);
  });

  it("passes an invalid value through untouched instead of throwing", () => {
    expect(lenientEnv(fields, { STRICT: "3" }).STRICT).toBe("3");
  });

  it("reads the source on every access, so a later change is seen", () => {
    const source: Record<string, string | undefined> = {};
    const env = lenientEnv(fields, source);
    expect(env.NAME).toBeUndefined();
    source.NAME = "set later";
    expect(env.NAME).toBe("set later");
  });

  it("gives every defaulted platform field its default with an empty environment", () => {
    const env = lenientEnv(allEnvFields, {});
    expect(env.WD_EXPORT_INLINE_MAX_MB).toBe(100);
    expect(env.WD_JOB_START_WINDOW_SECONDS).toBeTypeOf("number");
    expect(env.WD_JOB_LOG_MAX_LINES).toBeTypeOf("number");
    expect(env.WD_CASE_RETENTION_DAYS).toBeTypeOf("number");
  });
});
