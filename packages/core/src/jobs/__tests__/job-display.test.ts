import { describe, expect, it } from "vitest";

import {
  capabilityIdLabel,
  jobActivityLabel,
  playbookIdLabel,
  summarizeJobInput,
} from "../job-display";

describe("capabilityIdLabel", () => {
  it("title-cases the id tail", () => {
    expect(capabilityIdLabel("network.shodan.lookup")).toBe("Shodan Lookup");
    expect(capabilityIdLabel("network.dns.lookup")).toBe("DNS Lookup");
  });

  it("returns empty for missing id", () => {
    expect(capabilityIdLabel(null)).toBe("");
  });
});

describe("summarizeJobInput", () => {
  it("prefers host-style hints", () => {
    expect(summarizeJobInput({ host: "example.com", limit: 10 })).toBe(
      "example.com"
    );
  });

  it("skips internal keys in fallback scan", () => {
    expect(summarizeJobInput({ limit: 10, custom: "seed-value" })).toBe(
      "seed-value"
    );
  });

  it("resolves evidence ids via title map", () => {
    const titles = new Map([["ev-1", "screenshot.png"]]);
    expect(
      summarizeJobInput({ evidenceId: "ev-1", entityId: "ent-1" }, titles)
    ).toBe("screenshot.png");
  });
});

describe("playbookIdLabel", () => {
  it("title-cases the id tail", () => {
    expect(playbookIdLabel("host-footprint-lite")).toBe("Host Footprint Lite");
  });

  it("returns empty for missing id", () => {
    expect(playbookIdLabel(null)).toBe("");
  });

  it("returns Playbook for run-id UUID fallbacks", () => {
    expect(playbookIdLabel("00000000-0000-4000-8000-000000000001")).toBe(
      "Playbook"
    );
  });
});

describe("jobActivityLabel", () => {
  it("uses result summary when present", () => {
    expect(
      jobActivityLabel({
        capabilityId: "network.shodan.lookup",
        resultSummary: "3 open ports",
        input: { host: "1.2.3.4" },
      })
    ).toBe("Shodan Lookup — 3 open ports");
  });

  it("combines capability label with input subject", () => {
    expect(
      jobActivityLabel({
        capabilityId: "network.shodan.lookup",
        resultSummary: null,
        input: { host: "1.2.3.4" },
      })
    ).toBe("Shodan Lookup — 1.2.3.4");
  });

  it("labels playbook jobs with playbook title and seed subject", () => {
    expect(
      jobActivityLabel({
        capabilityId: "network.dns.lookup",
        resultSummary: null,
        input: { host: "example.com" },
        playbookId: "host-footprint-lite",
      })
    ).toBe("Host Footprint Lite — example.com");
  });

  it("labels playbook jobs with playbook title and result summary", () => {
    expect(
      jobActivityLabel({
        capabilityId: "network.dns.lookup",
        resultSummary: "2 records",
        input: { host: "example.com" },
        playbookId: "host-footprint-lite",
      })
    ).toBe("Host Footprint Lite — 2 records");
  });

  it("resolves evidence titles from input evidenceId", () => {
    const titles = new Map([["ev-1", "screenshot.png"]]);
    expect(
      jobActivityLabel({
        capabilityId: "evidence.harvest",
        resultSummary: null,
        input: { evidenceId: "ev-1" },
        evidenceTitleById: titles,
      })
    ).toBe("Harvest — screenshot.png");
  });

  it("resolves entity titles from input entityId", () => {
    const titles = new Map([["ent-1", "Acme Corp"]]);
    expect(
      jobActivityLabel({
        capabilityId: "network.shodan.lookup",
        resultSummary: null,
        input: { entityId: "ent-1" },
        entityTitleById: titles,
      })
    ).toBe("Shodan Lookup — Acme Corp");
  });
});
