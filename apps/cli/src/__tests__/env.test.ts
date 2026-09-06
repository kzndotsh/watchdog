import { afterEach, describe, expect, it } from "vitest";

import { loadCliEnv, resetCliEnvForTests } from "../env";

describe("loadCliEnv", () => {
  afterEach(() => {
    resetCliEnvForTests();
    Reflect.deleteProperty(process.env, "WD_API_KEY");
    Reflect.deleteProperty(process.env, "WD_API_URL");
  });

  it("does not validate on import", async () => {
    const mod = await import("../env");
    expect(typeof mod.loadCliEnv).toBe("function");
  });

  it("requires WD_API_KEY on first use", () => {
    Reflect.deleteProperty(process.env, "WD_API_KEY");
    expect(() => loadCliEnv()).toThrow();
  });

  it("defaults WD_API_URL when only the key is set", () => {
    process.env.WD_API_KEY = "test-key";
    Reflect.deleteProperty(process.env, "WD_API_URL");
    const env = loadCliEnv();
    expect(env.WD_API_KEY).toBe("test-key");
    expect(env.WD_API_URL).toBe("http://localhost:3000/api/v1");
  });
});
