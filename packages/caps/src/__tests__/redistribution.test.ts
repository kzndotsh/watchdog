import { describe, expect, it } from "vitest";

import { fixedContactHost } from "@watchdog/schemas/caps";

import { redistributionVerdictFor } from "../redistribution";
import { CAPABILITIES } from "../registry";

/** The hosts the Caps' providers declare a verdict for, with the verdict. */
function providerVerdicts(): Map<string, string> {
  const verdicts = new Map<string, string>();
  for (const { provider } of CAPABILITIES) {
    for (const [host, verdict] of Object.entries(provider.hosts ?? {})) {
      verdicts.set(host, verdict);
    }
  }
  return verdicts;
}

/** Every fixed host or zone some Cap declares: the hosts a response body can come from. */
function declaredHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const cap of CAPABILITIES) {
    for (const contact of cap.contacts) {
      const host = fixedContactHost(contact);
      if (host !== undefined) hosts.add(host);
    }
  }
  return hosts;
}

describe("redistribution verdicts", () => {
  it("has a provider verdict for every fixed host a Cap declares, and none for a host no Cap declares", () => {
    const declared = [...declaredHosts()].sort();
    expect([...providerVerdicts().keys()].sort()).toEqual(declared);
  });

  it("puts each host on exactly one provider", () => {
    const owners = new Map<string, Set<string>>();
    for (const { provider } of CAPABILITIES) {
      for (const host of Object.keys(provider.hosts ?? {})) {
        const names = owners.get(host) ?? new Set<string>();
        names.add(provider.name);
        owners.set(host, names);
      }
    }
    for (const [host, names] of owners) {
      expect([host, names.size]).toEqual([host, 1]);
    }
  });

  it("answers unknown for a host nobody reviewed, never allowed", () => {
    expect(redistributionVerdictFor("not-reviewed.example")).toBe("unknown");
    expect(redistributionVerdictFor("constructor")).toBe("unknown");
  });

  it("reads a host in any case and with a trailing dot", () => {
    expect(redistributionVerdictFor("CRT.sh.")).toBe(
      providerVerdicts().get("crt.sh")
    );
    expect(redistributionVerdictFor("crt.sh")).toBe("forbidden");
  });
});
