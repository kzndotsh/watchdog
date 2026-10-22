import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CAPABILITIES } from "../../registry";
import { defineCapability } from "../define";
import { deriveCapFlags, toCapDescriptor } from "../descriptor";
import { defineProvider } from "../provider";

const ok = {
  name: "Demo",
  url: "https://example.com",
  termsUrl: "https://example.com/terms",
  tier: "free",
  commercialUse: "unknown",
} as const;

describe("defineProvider", () => {
  it("returns a valid provider", () => {
    expect(defineProvider(ok)).toEqual(ok);
  });

  it("rejects a non-https terms url", () => {
    expect(() =>
      defineProvider({ ...ok, termsUrl: "http://example.com/terms" })
    ).toThrow("termsUrl must be an https URL");
  });

  it("rejects an attribution without an https link", () => {
    expect(() =>
      defineProvider({ ...ok, attribution: { text: "x", url: "nope" } })
    ).toThrow("attribution.url");
  });

  it("requires a self provider to allow commercial use", () => {
    expect(() => defineProvider({ ...ok, tier: "self" })).toThrow("self");
  });

  it("requires a name and a non-empty credit", () => {
    expect(() => defineProvider({ ...ok, name: "  " })).toThrow(
      "Provider name is required"
    );
    expect(() =>
      defineProvider({
        ...ok,
        attribution: { text: " ", url: "https://example.com" },
      })
    ).toThrow("attribution.text must not be empty");
  });

  it("rejects a link without a dotted host or with whitespace", () => {
    for (const url of ["https://localhost/terms", "https://example.com/a b"]) {
      expect(() => defineProvider({ ...ok, termsUrl: url })).toThrow(
        "termsUrl must be an https URL"
      );
    }
  });

  it("checks a pathological link in linear time (no regex backtracking)", () => {
    const started = performance.now();
    try {
      defineProvider({ ...ok, termsUrl: `https://${"!.".repeat(50_000)}` });
    } catch {
      // Accepting or rejecting is fine here; only the time is under test.
    }
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe("every registered Cap", () => {
  it("has a provider with https links", () => {
    for (const cap of CAPABILITIES) {
      expect(cap.provider.url, cap.id).toMatch(/^https:\/\//);
      expect(cap.provider.termsUrl, cap.id).toMatch(/^https:\/\//);
    }
  });

  it("is self-tier exactly when it has no third-party provider", () => {
    for (const cap of CAPABILITIES) {
      if (cap.provider.tier === "self") {
        expect(cap.egress ?? "none", cap.id).toBe("none");
        expect(cap.provider.commercialUse, cap.id).toBe("allowed");
      }
    }
  });

  it("derives the same flags it would have if written by hand", () => {
    const keyed = CAPABILITIES.find((c) => c.id === "threat.virustotal.lookup");
    expect(keyed && deriveCapFlags(keyed)).toEqual([
      "needs_key",
      "third_party",
    ]);
  });
});

describe("deriveCapFlags", () => {
  it("derives needs_key from a required credential and third_party from egress", () => {
    expect(
      deriveCapFlags({
        credentials: [{ name: "K" }],
        egress: "third_party",
        flags: ["slow"],
      })
    ).toEqual(["needs_key", "third_party", "slow"]);
  });

  it("does not need a key when every credential is optional", () => {
    expect(
      deriveCapFlags({ credentials: [{ name: "K", optional: true }] })
    ).toEqual([]);
  });

  it("needs a key for an anyOf group", () => {
    expect(deriveCapFlags({ credentials: [{ anyOf: ["A", "B"] }] })).toEqual([
      "needs_key",
    ]);
  });

  it("puts the provider on the descriptor", () => {
    const cap = defineCapability({
      id: "test.cap",
      title: "Test",
      provider: defineProvider(ok),
      input: z.object({}),
      run: () => Effect.succeed({ artifacts: [] }),
    });
    expect(toCapDescriptor(cap).provider).toEqual(ok);
  });
});
