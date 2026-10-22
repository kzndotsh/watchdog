import { describe, expect, it } from "vitest";

import { capAttribution } from "@/domains/jobs/lib/cap-attribution";
import type { CapProviderInfo } from "@/domains/jobs/types";

const provider = (attribution?: CapProviderInfo["attribution"]) => ({
  name: "P",
  url: "https://example.com",
  termsUrl: "https://example.com/terms",
  tier: "free" as const,
  commercialUse: "unknown" as const,
  ...(attribution ? { attribution } : {}),
});

describe("capAttribution", () => {
  const caps = [
    {
      id: "breach.hibp.lookup",
      provider: provider({ text: "Data from HIBP", url: "https://hibp.test" }),
    },
    { id: "network.dns.lookup", provider: provider() },
  ];

  it("returns the credit of the Cap's provider", () => {
    expect(capAttribution(caps, "breach.hibp.lookup")).toEqual({
      text: "Data from HIBP",
      url: "https://hibp.test",
    });
  });

  it("is null when the terms ask for none, the Cap is unknown, or no Job is selected", () => {
    expect(capAttribution(caps, "network.dns.lookup")).toBeNull();
    expect(capAttribution(caps, "no.such.cap")).toBeNull();
    expect(capAttribution(caps, undefined)).toBeNull();
  });
});
