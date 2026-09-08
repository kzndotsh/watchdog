import { Effect, Result } from "effect";
import { describe, it, expect } from "vitest";

import {
  normalizeIp,
  normalizeIpEffect,
  dedupeResolvedIps,
} from "../reverse.ts";
import { classifyTxtRecord } from "../txt-inventory.ts";

describe("dns-helpers", () => {
  it("classifyTxtRecord maps SaaS verification + SPF", () => {
    expect(classifyTxtRecord("google-site-verification=abc").service).toBe(
      "google_search_console"
    );
    expect(classifyTxtRecord("v=spf1 -all").kind).toBe("spf");
    expect(classifyTxtRecord("random-txt").kind).toBe("other");
  });

  it("normalizeIp accepts IPv4 and rejects junk", () => {
    expect(normalizeIp(" 8.8.8.8 ")).toBe("8.8.8.8");
    expect(() => normalizeIp("not-an-ip")).toThrow(/Invalid IP/);
  });

  it("normalizeIpEffect maps invalid input to ToolsTag", async () => {
    const ok = await Effect.runPromise(normalizeIpEffect("8.8.8.8"));
    expect(ok).toBe("8.8.8.8");
    const bad = await Effect.runPromise(
      Effect.result(normalizeIpEffect("bad"))
    );
    expect(Result.isFailure(bad)).toBe(true);
  });

  it("dedupeResolvedIps canonicalizes equivalent IPv6 answers", () => {
    expect(
      dedupeResolvedIps([
        "2001:0db8:0000:0000:0000:0000:0000:0001",
        "2001:db8::1",
        "8.8.8.8",
        "8.8.8.8",
      ])
    ).toEqual(["2001:0db8:0000:0000:0000:0000:0000:0001", "8.8.8.8"]);
  });
});
