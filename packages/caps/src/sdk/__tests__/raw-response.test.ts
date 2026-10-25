import { describe, expect, it } from "vitest";

import { listCapabilities } from "../../registry";
import { capBodyPolicy } from "../raw-response";

describe("capBodyPolicy", () => {
  it("keeps bodies up to the default limit unless the Cap says otherwise", () => {
    expect(capBodyPolicy({ id: "network.shodan.host" })).toEqual({
      kind: "keep",
      maxBytes: undefined,
    });
  });

  it("honours a Cap's own limit and its hash-only declaration", () => {
    expect(
      capBodyPolicy({
        id: "network.firehol.lookup",
        rawResponse: { keep: { maxBytes: 4096 } },
      })
    ).toEqual({ kind: "keep", maxBytes: 4096 });
    expect(
      capBodyPolicy({
        id: "network.example",
        rawResponse: { keep: "hash_only" },
      })
    ).toEqual({ kind: "hash_only" });
  });

  it("makes every breach Cap fingerprint-only, whatever it declares", () => {
    expect(
      capBodyPolicy({
        id: "breach.hibp.lookup",
        rawResponse: { keep: { maxBytes: 4096 } },
      })
    ).toEqual({ kind: "hash_only" });
    const breach = listCapabilities().filter((cap) =>
      cap.id.startsWith("breach.")
    );
    expect(breach.length).toBeGreaterThan(0);
    for (const cap of breach) {
      expect(capBodyPolicy(cap), cap.id).toEqual({ kind: "hash_only" });
    }
  });
});
