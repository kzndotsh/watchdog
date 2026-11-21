import { describe, expect, it } from "vitest";

import {
  capEgressLabel,
  capabilityIdLabel,
  playbookIdLabel,
} from "../cap-display";

describe("capEgressLabel", () => {
  it("names each derived class", () => {
    expect(capEgressLabel(["local"])).toBe("Local only");
    expect(capEgressLabel(["target", "public_lookup", "account_lookup"])).toBe(
      "The target itself, Public lookups, Account lookups"
    );
  });
});

describe("capabilityIdLabel", () => {
  it("humanizes dotted capability ids", () => {
    expect(capabilityIdLabel("network.shodan.lookup")).toBe("Shodan Lookup");
  });
});

describe("playbookIdLabel", () => {
  it("humanizes kebab playbook ids", () => {
    expect(playbookIdLabel("host-footprint-lite")).toBe("Host Footprint Lite");
  });
});
