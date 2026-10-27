import { describe, it, expect } from "vitest";

import { testCapProvider } from "@/testing/records";
import { testHttpUrl } from "@watchdog/test-kit";

import type { CapListItem } from "../../types.ts";
import { detectPasteSeed, matchCaps } from "../cap-match.ts";

describe("cap-match", () => {
  const sample: CapListItem[] = [
    {
      id: "network.dns.lookup",
      version: "1",
      provider: testCapProvider,
      title: "DNS lookup",
      egress: ["local"],
      contacts: [],
      kind: "collect",
      useCases: ["Passive", "Footprint"],
      consumes: [{ kind: "host" }],
      input: {},
      inputForm: {},
    },
    {
      id: "web.page.enrich",
      version: "1",
      provider: testCapProvider,
      title: "Page enrich",
      egress: ["local"],
      contacts: [],
      kind: "collect",
      useCases: ["Active"],
      flags: ["invasive"],
      consumes: [{ kind: "url" }],
      input: {},
      inputForm: {},
    },
    {
      id: "evidence.harvest",
      version: "1",
      provider: testCapProvider,
      title: "Harvest Evidence",
      egress: ["local"],
      contacts: [],
      kind: "process",
      consumes: [{ kind: "evidence", evidenceKind: "file" }],
      input: {},
      inputForm: {},
    },
    {
      id: "network.dns.reverse",
      version: "1",
      provider: testCapProvider,
      title: "Reverse DNS",
      egress: ["local"],
      contacts: [],
      kind: "collect",
      useCases: ["Passive", "Footprint"],
      consumes: [{ kind: "ip" }],
      input: {},
      inputForm: {},
    },
    {
      id: "threat.virustotal.lookup",
      version: "1",
      provider: testCapProvider,
      title: "VirusTotal lookup",
      egress: ["account_lookup"],
      contacts: [
        { kind: "provider", host: "api.vendor.test", access: "keyed" },
      ],
      kind: "collect",
      consumes: [{ kind: "ip" }, { kind: "host" }],
      input: {},
      inputForm: {},
    },
    {
      id: "network.shodan.lookup",
      version: "1",
      provider: testCapProvider,
      title: "Shodan lookup",
      egress: ["account_lookup"],
      contacts: [
        { kind: "provider", host: "api.vendor.test", access: "keyed" },
      ],
      kind: "collect",
      consumes: [{ kind: "ip" }],
      input: {},
      inputForm: {},
    },
    {
      id: "network.url.enrich",
      version: "1",
      provider: testCapProvider,
      title: "Enrich URL",
      egress: ["local"],
      contacts: [],
      kind: "enrich",
      consumes: [{ kind: "url" }],
      input: {},
      inputForm: {},
    },
    {
      id: "threat.hashlookup.lookup",
      version: "1",
      provider: testCapProvider,
      title: "CIRCL hashlookup",
      egress: ["local"],
      contacts: [],
      kind: "collect",
      consumes: [{ kind: "hash" }],
      input: {},
      inputForm: {},
    },
  ];

  it("detectPasteSeed host / ip / email / handle / url / evidence / hash", () => {
    expect(detectPasteSeed("example.com").kind).toBe("host");
    expect(detectPasteSeed("8.8.8.8").kind).toBe("ip");
    expect(detectPasteSeed("2001:4860:4860::8888").kind).toBe("ip");
    expect(detectPasteSeed("bob@example.com").kind).toBe("email");
    expect(detectPasteSeed("@octocat").kind).toBe("handle");
    expect(detectPasteSeed(testHttpUrl("example.com/a")).kind).toBe("url");
    expect(detectPasteSeed("11111111-1111-4111-8111-111111111111").kind).toBe(
      "evidence"
    );
    expect(
      detectPasteSeed(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      ).kind
    ).toBe("hash");
  });

  it("matchCaps filters by paste consumes + useCase", () => {
    const matched = matchCaps(sample, {
      kinds: [],
      categories: [],
      intents: ["Passive"],
      isKeyOnlyNeeded: false,
      paste: detectPasteSeed("example.com"),
    });
    expect(matched.length).toBe(1);
    expect(matched[0]?.id).toBe("network.dns.lookup");
  });

  it("matchCaps prefers reverse DNS for IP paste", () => {
    const matched = matchCaps(sample, {
      kinds: [],
      categories: [],
      intents: [],
      isKeyOnlyNeeded: false,
      paste: detectPasteSeed("8.8.8.8"),
    });
    expect(matched.map((c) => c.id).sort((a, b) => a.localeCompare(b))).toEqual(
      [
        "network.dns.reverse",
        "network.shodan.lookup",
        "threat.virustotal.lookup",
      ]
    );
  });

  it("matchCaps hides hash Caps on host paste and shows them on SHA-256", () => {
    const hostMatched = matchCaps(sample, {
      kinds: [],
      categories: [],
      intents: [],
      isKeyOnlyNeeded: false,
      paste: detectPasteSeed("example.com"),
    });
    expect(hostMatched.map((c) => c.id)).not.toContain(
      "threat.hashlookup.lookup"
    );

    const hashMatched = matchCaps(sample, {
      kinds: [],
      categories: [],
      intents: [],
      isKeyOnlyNeeded: false,
      paste: detectPasteSeed(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      ),
    });
    expect(hashMatched.map((c) => c.id)).toEqual(["threat.hashlookup.lookup"]);
  });

  it("matchCaps URL paste keeps host Caps and url Caps, drops ip-only", () => {
    const matched = matchCaps(sample, {
      kinds: [],
      categories: [],
      intents: [],
      isKeyOnlyNeeded: false,
      paste: detectPasteSeed(testHttpUrl("evil.example/path")),
    });
    const ids = matched.map((c) => c.id);
    expect(ids).toContain("threat.virustotal.lookup");
    expect(ids).toContain("network.url.enrich");
    expect(ids).toContain("web.page.enrich");
    expect(ids).toContain("network.dns.lookup");
    expect(ids).not.toContain("network.shodan.lookup");
    expect(ids).not.toContain("threat.hashlookup.lookup");
  });
});
