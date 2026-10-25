import { describe, expect, it } from "vitest";

import { fixedContactHost } from "@watchdog/schemas/caps";

import {
  HOST_REDISTRIBUTION,
  redistributionVerdictFor,
} from "../redistribution";
import { CAPABILITIES } from "../registry";

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
  it("has a reviewed entry for every fixed host a Cap declares, and none for a host no Cap declares", () => {
    const declared = [...declaredHosts()].toSorted();
    expect(Object.keys(HOST_REDISTRIBUTION).toSorted()).toEqual(declared);
  });

  it("answers unknown for a host nobody reviewed, never allowed", () => {
    expect(redistributionVerdictFor("not-reviewed.example")).toBe("unknown");
    expect(redistributionVerdictFor("constructor")).toBe("unknown");
  });

  it("reads a host in any case and with a trailing dot", () => {
    expect(redistributionVerdictFor("CRT.sh.")).toBe(
      HOST_REDISTRIBUTION["crt.sh"]
    );
  });
});
