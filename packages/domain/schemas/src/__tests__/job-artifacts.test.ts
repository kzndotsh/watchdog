import { describe, expect, it } from "vitest";

import {
  isJobInternalArtifact,
  isProcessCapability,
} from "../job-artifacts.ts";

describe("isJobInternalArtifact", () => {
  it("treats report.json as internal", () => {
    expect(isJobInternalArtifact("report.json")).toBe(true);
    expect(isJobInternalArtifact("notes.txt")).toBe(false);
  });

  it("treats enrich internals as internal", () => {
    expect(isJobInternalArtifact("enriched.md")).toBe(true);
    expect(isJobInternalArtifact("_wd-scratch.bin")).toBe(true);
  });
});

describe("isProcessCapability", () => {
  it("includes current process capability ids", () => {
    expect(isProcessCapability("evidence.harvest")).toBe(true);
    expect(isProcessCapability("evidence.extract.ai")).toBe(true);
    expect(isProcessCapability("network.dns.lookup")).toBe(false);
  });
});
