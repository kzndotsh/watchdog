import { describe, expect, it } from "vitest";

import { jobHeadlineLabel } from "@/shared/ui/vocab/job";

describe("jobHeadlineLabel", () => {
  it("prefers playbook label when playbookId is set", () => {
    expect(
      jobHeadlineLabel({
        capabilityId: "network.dns.lookup",
        playbookId: "host-footprint",
      })
    ).toBe("Host Footprint");
  });

  it("falls back to capability label for solo jobs", () => {
    expect(
      jobHeadlineLabel({
        capabilityId: "network.shodan.lookup",
      })
    ).toBe("Shodan Lookup");
  });
});
