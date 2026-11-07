import { describe, expect, it, vi } from "vitest";

import { api, getConfig } from "../client";
import { CliConfigError } from "../env";
import { API_KEY, API_URL, standInApi } from "./stand-in-api";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const standIn = standInApi();

describe("cli client", () => {
  it("getConfig reads api url and key from the environment", () => {
    expect(getConfig()).toEqual({ apiUrl: API_URL, apiKey: API_KEY });
  });

  it("getConfig refuses a missing key", () => {
    vi.stubEnv("WD_API_KEY", "");
    // The memoized env was reset by the stand-in's beforeEach; read it fresh.
    expect(() => getConfig()).toThrow(CliConfigError);
  });

  it("api sends requests to the configured url with the key", async () => {
    standIn.json("get", "/auth/whoami", {
      credential: "apiKey",
      keyId: "k",
      scopes: [],
      organizationId: "org-1",
    });

    const who = await api().auth.whoami();

    expect(who.organizationId).toBe("org-1");
    expect(standIn.seen).toHaveLength(1);
    expect(standIn.seen[0]?.path).toBe("/auth/whoami");
    expect(standIn.seen[0]?.headers.get("x-api-key")).toBe(API_KEY);
  });
});
