import { describe, expect, it } from "vitest";

import { listCapabilities, requireCapability } from "../../registry";
import { capLane } from "../lane";

describe("capLane", () => {
  it("derives the lane from kind and flags", () => {
    expect(capLane({})).toBe("quick");
    expect(capLane({ kind: "collect" })).toBe("quick");
    expect(capLane({ kind: "enrich" })).toBe("quick");
    expect(capLane({ kind: "process" })).toBe("heavy");
    expect(capLane({ kind: "collect", flags: ["slow"] })).toBe("heavy");
    expect(capLane({ kind: "collect", flags: ["invasive"] })).toBe("quick");
    expect(capLane({ kind: "act" })).toBe("act");
    expect(capLane({ kind: "act", flags: ["slow"] })).toBe("act");
  });

  it("lets a Cap override the derived lane", () => {
    expect(capLane({ kind: "collect", lane: "heavy" })).toBe("heavy");
    expect(capLane({ kind: "act", lane: "quick" })).toBe("quick");
  });

  it("puts the registered Caps in the lanes their descriptors imply", () => {
    expect(capLane(requireCapability("network.dns.lookup"))).toBe("quick");
    expect(capLane(requireCapability("archive.url.submit"))).toBe("act");
    expect(capLane(requireCapability("network.urlscan.submit"))).toBe("act");
    expect(capLane(requireCapability("evidence.harvest"))).toBe("heavy");
    expect(capLane(requireCapability("evidence.eml.analyze"))).toBe("heavy");
    expect(capLane(requireCapability("network.url.enrich"))).toBe("heavy");
  });

  it("puts every act Cap in the act lane and no other Cap there", () => {
    for (const cap of listCapabilities()) {
      expect(capLane(cap) === "act").toBe(cap.kind === "act");
    }
  });
});
