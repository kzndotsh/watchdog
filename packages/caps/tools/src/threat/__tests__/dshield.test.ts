import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseDshieldBody } from "../dshield";

const fixtureDir = path.join(import.meta.dirname, "../__fixtures__");

describe("parseDshieldBody", () => {
  it("marks found when attacks, counts, or threat feeds are present", () => {
    const raw = JSON.parse(
      readFileSync(path.join(fixtureDir, "dshield-ip.json"), "utf-8")
    ) as { ip: Record<string, unknown> };
    const snap = parseDshieldBody(
      "1.2.3.4",
      "2026-01-01T00:00:00.000Z",
      raw.ip
    );
    expect(snap.found).toBe(true);
    expect(snap.attacks).toBe(34);
  });

  it("does not mark found for ASN metadata alone", () => {
    const snap = parseDshieldBody("8.8.8.8", "2026-01-01T00:00:00.000Z", {
      asname: "GOOGLE",
      network: "8.8.8.0/24",
      attacks: "0",
      count: "0",
    });
    expect(snap.found).toBe(false);
    expect(snap.asname).toBe("GOOGLE");
  });
});
