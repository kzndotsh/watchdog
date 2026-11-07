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

  it("treats a refused value as unset instead of throwing", () => {
    expect(lenientEnv(fields, { LIMIT: "0" }).LIMIT).toBe(100);
    expect(lenientEnv(fields, { STRICT: "3" }).STRICT).toBeUndefined();
  });

  it("reads the source on every access, so a later change is seen", () => {
    const source: Record<string, string | undefined> = {};
    const env = lenientEnv(fields, source);
    expect(env.NAME).toBeUndefined();
    source.NAME = "set later";
    expect(env.NAME).toBe("set later");
  });

  it("gives every defaulted platform field its schema default with an empty environment", () => {
    const env: Record<string, unknown> = lenientEnv(allEnvFields, {});
    const defaulted = Object.entries<z.ZodType>(allEnvFields).flatMap(
      ([name, schema]) => {
        const unset = schema.safeParse(undefined);
        return unset.success && unset.data !== undefined
          ? [[name, unset.data] as const]
          : [];
      }
    );
    expect(defaulted.length).toBeGreaterThan(10);
    for (const [name, value] of defaulted) {
      expect(env[name], name).toStrictEqual(value);
    }
  });
});
