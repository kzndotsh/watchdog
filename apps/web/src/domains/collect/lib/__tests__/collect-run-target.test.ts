import { describe, expect, it } from "vitest";

import {
  collectRunTargetValue,
  parseCollectRunTarget,
} from "@/domains/collect/lib/collect-run-target";

describe("parseCollectRunTarget", () => {
  it("reads a Cap and a Playbook", () => {
    expect(parseCollectRunTarget("cap:network.dns.lookup")).toEqual({
      kind: "cap",
      id: "network.dns.lookup",
    });
    expect(parseCollectRunTarget("playbook:host-footprint")).toEqual({
      kind: "playbook",
      id: "host-footprint",
    });
  });

  it("drops anything else", () => {
    for (const value of ["", "cap", "cap:", "job:1", "cap: ", 7, undefined]) {
      expect(parseCollectRunTarget(value)).toBeUndefined();
    }
  });

  it("round-trips", () => {
    const target = { kind: "playbook", id: "x" } as const;
    expect(parseCollectRunTarget(collectRunTargetValue(target))).toEqual(
      target
    );
  });
});
