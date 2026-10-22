import { assert, describe, expect, it } from "vitest";

import { buildCapDetailView } from "@/domains/library/lib/cap-detail";
import {
  capFacts,
  dataLabel,
  playbookFacts,
} from "@/domains/library/lib/entry-facts";
import { buildLibraryEntries } from "@/domains/library/lib/library-entries";
import { buildCapListItem, buildPlaybookListItem } from "@/testing/records";

const caps = [
  buildCapListItem({
    id: "network.shodan.lookup",
    credentials: [{ name: "SHODAN_API_KEY" }],
    consumes: [{ kind: "identifier", type: "ip" }],
    timeoutMs: 45_000,
    egress: "third_party",
  }),
  buildCapListItem({ id: "network.dns.lookup", consumes: [] }),
];

describe("capFacts", () => {
  it("reads takes, returns, data, plan, keys and timeout", () => {
    const cap = caps[0];
    assert(cap !== undefined);
    const view = buildCapDetailView(cap, [], new Set(["ip"]));
    const facts = capFacts({ isThirdParty: true }, view, "free");
    expect(facts.map((f) => f.caption)).toEqual([
      "Takes",
      "Returns",
      "Data",
      "Plan",
      "Keys",
      "Timeout",
    ]);
    expect(facts[0]?.value).toBe("IP address");
    expect(facts[2]?.value).toBe("Sent out");
    expect(facts[3]?.value).toBe("Free");
    expect(facts[4]?.value).toBe("1");
    expect(facts[5]?.value).toBe("45 s");
  });

  it("falls back to Nothing, None and Default", () => {
    const cap = caps[1];
    assert(cap !== undefined);
    const view = buildCapDetailView(cap, [], new Set());
    const facts = capFacts({ isThirdParty: false }, view, "self");
    expect(facts[0]?.value).toBe("Nothing");
    expect(facts[2]?.value).toBe("Stays here");
    expect(facts[4]?.value).toBe("None");
    expect(facts[5]?.value).toBe("Default");
  });
});

describe("playbookFacts", () => {
  const entry = buildLibraryEntries({
    caps,
    playbooks: [
      buildPlaybookListItem({
        id: "chain",
        seedKinds: ["ip"],
        steps: ["network.dns.lookup", "network.shodan.lookup"],
        stepDependencies: [[], [0]],
      }),
    ],
    configured: new Set<string>(),
  }).find((e) => e.kind === "playbook");

  it("counts steps, providers and keys needed", () => {
    assert(entry !== undefined);
    const facts = playbookFacts(entry);
    expect(Object.fromEntries(facts.map((f) => [f.caption, f.value]))).toEqual({
      Steps: "2",
      "Starts from": "IP address",
      Providers: String(entry.providers.length),
      "Steps missing a key": "1",
      Data: "Stays here",
    });
  });
});

describe("dataLabel", () => {
  it("says where the input goes", () => {
    expect(dataLabel({ isThirdParty: true })).toBe("Sent out");
    expect(dataLabel({ isThirdParty: false })).toBe("Stays here");
  });
});
