import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchMnemonicPdnsEffect, parseMnemonicPdnsBody } from "../mnemonic";

const fixtureDir = path.join(import.meta.dirname, "../__fixtures__");
const pdnsFixture = JSON.parse(
  readFileSync(path.join(fixtureDir, "mnemonic-pdns.json"), "utf-8")
);

describe("mnemonic", () => {
  it("parseMnemonicPdnsBody maps domain PDNS rows", () => {
    const snap = parseMnemonicPdnsBody(
      "dns.google",
      "domain",
      "2026-01-01T00:00:00.000Z",
      pdnsFixture
    );

    expect(snap.kind).toBe("domain");
    expect(snap.records).toHaveLength(1);
    expect(snap.ips).toEqual(["8.8.8.8"]);
    expect(snap.records[0]?.rrtype).toBe("a");
    expect(snap.records[0]?.times).toBe(12);
  });

  it("parseMnemonicPdnsBody rejects resource-limit responses", () => {
    expect(() =>
      parseMnemonicPdnsBody(
        "dns.google",
        "domain",
        "2026-01-01T00:00:00.000Z",
        {
          responseCode: 402,
        }
      )
    ).toThrow(/resource limit exceeded/i);
  });

  it.effect("fetchMnemonicPdnsEffect maps API JSON", () =>
    Effect.gen(function* fetchMnemonicGen() {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify(pdnsFixture), { status: 200 })
          )
      );

      const snap = yield* fetchMnemonicPdnsEffect(
        "dns.google",
        AbortSignal.timeout(5000)
      );

      expect(snap.query).toBe("dns.google");
      expect(snap.ips).toEqual(["8.8.8.8"]);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
