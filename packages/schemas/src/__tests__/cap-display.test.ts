import { describe, expect, it } from "vitest";

import {
  capEgressLabel,
  capabilityIdLabel,
  playbookIdLabel,
} from "../cap-display";

describe("capEgressLabel", () => {
  it("labels third-party egress", () => {
    expect(capEgressLabel("third_party")).toBe("Third party");
    expect(capEgressLabel(true)).toBe("Third party");
  });

  it("labels none egress", () => {
    expect(capEgressLabel("none")).toBe("None");
    expect(capEgressLabel(null)).toBe("None");
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
