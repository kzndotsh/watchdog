import { describe, expect, it } from "vitest";

import { findFeodoEntry, type FeodoEntry } from "../feodo-parse";

function entry(ipAddress: string): FeodoEntry {
  return {
    ipAddress,
    malware: "Emotet",
    status: "online",
    firstSeen: "2026-01-01",
    lastOnline: "2026-01-02",
  };
}

describe("findFeodoEntry", () => {
  const entries = [
    entry("1.2.3.4"),
    entry("2001:0db8:0000:0000:0000:ff00:0042:8329"),
  ];

  it("matches IPv4 addresses exactly", () => {
    expect(findFeodoEntry(entries, "1.2.3.4")?.malware).toBe("Emotet");
    expect(findFeodoEntry(entries, "9.9.9.9")).toBeUndefined();
  });

  it("normalizes IPv6 addresses before matching", () => {
    expect(findFeodoEntry(entries, "2001:db8::ff00:42:8329")?.ipAddress).toBe(
      "2001:0db8:0000:0000:0000:ff00:0042:8329"
    );
    expect(findFeodoEntry(entries, "not-an-ip")).toBeUndefined();
  });
});
