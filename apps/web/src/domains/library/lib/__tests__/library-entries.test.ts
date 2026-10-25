import { describe, expect, it } from "vitest";

import {
  buildLibraryEntries,
  groupLibraryEntries,
  dataLabel,
  relatedEntries,
} from "@/domains/library/lib/library-entries";
import {
  buildCapListItem,
  buildPlaybookListItem,
  testCapProvider,
} from "@/testing/records";

const dns = buildCapListItem();
const whois = buildCapListItem({
  id: "network.whois.lookup",
  title: "Whois lookup",
  provider: { ...testCapProvider, name: "Whois Co", commercialUse: "allowed" },
});
const shodan = buildCapListItem({
  id: "network.shodan.lookup",
  title: "Shodan lookup",
  egress: ["account_lookup"],
  contacts: [{ kind: "provider", host: "api.vendor.test", access: "keyed" }],
  provider: {
    ...testCapProvider,
    name: "Shodan",
    commercialUse: "restricted",
  },
  credentials: [{ name: "SHODAN_API_KEY" }],
});
const gravatar = buildCapListItem({
  id: "identity.gravatar.lookup",
  title: "Gravatar lookup",
  consumes: [{ kind: "identifier", type: "email" }],
});
const hibp = buildCapListItem({
  id: "breach.hibp.lookup",
  title: "HIBP lookup",
  consumes: [{ kind: "identifier", type: "email" }],
  disabledReason: "breach_disabled",
});

const footprint = buildPlaybookListItem({
  steps: [dns.id, whois.id, shodan.id],
  requires: {
    credentials: [{ name: "SHODAN_API_KEY" }],
    egress: ["account_lookup"],
    contacts: [{ kind: "provider", host: "api.vendor.test", access: "keyed" }],
    flags: [],
  },
});

function build(configured: string[] | null) {
  return buildLibraryEntries({
    caps: [shodan, hibp, gravatar, whois, dns],
    playbooks: [footprint],
    configured: configured === null ? null : new Set(configured),
  });
}

describe("buildLibraryEntries", () => {
  it("lists Playbooks and Caps with their category, providers and input kinds", () => {
    const entries = build([]);
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    expect(byKey.get("cap:network.shodan.lookup")).toMatchObject({
      kind: "cap",
      category: "network",
      categoryLabel: "Network",
      providers: ["Shodan"],
      isThirdParty: true,
      inputKinds: ["domain"],
    });
    expect(byKey.get("playbook:host-footprint")).toMatchObject({
      kind: "playbook",
      category: "playbook",
      categoryLabel: "Playbooks",
      isThirdParty: true,
      inputKinds: ["domain"],
    });
  });

  it("gives a Playbook its steps' providers and their strictest commercial terms", () => {
    const playbook = build([]).find((entry) => entry.kind === "playbook");
    expect(playbook?.providers).toEqual([
      "Test provider",
      "Whois Co",
      "Shodan",
    ]);
    expect(playbook?.commercialUse).toBe("restricted");
  });

  it("maps readiness for the viewer's vault", () => {
    const state = (entries: ReturnType<typeof build>, key: string) =>
      entries.find((entry) => entry.key === key)?.readiness.state;
    expect(state(build([]), "cap:network.shodan.lookup")).toBe("needs_key");
    expect(state(build(["SHODAN_API_KEY"]), "cap:network.shodan.lookup")).toBe(
      "ready"
    );
    expect(state(build([]), "cap:breach.hibp.lookup")).toBe("off_by_operator");
    expect(state(build(null), "cap:network.shodan.lookup")).toBe("unavailable");
    expect(state(build(null), "cap:network.dns.lookup")).toBe("ready");
  });
});

describe("groupLibraryEntries", () => {
  it("puts Playbooks first, then categories alphabetically", () => {
    expect(groupLibraryEntries(build([])).map((group) => group.id)).toEqual([
      "playbook",
      "breach",
      "identity",
      "network",
    ]);
  });

  it("sorts ready entries first in each group, then by title", () => {
    const network = groupLibraryEntries(build([])).find(
      (group) => group.id === "network"
    );
    expect(network?.entries.map((entry) => entry.title)).toEqual([
      "DNS lookup",
      "Whois lookup",
      "Shodan lookup",
    ]);
    const withKey = groupLibraryEntries(build(["SHODAN_API_KEY"])).find(
      (group) => group.id === "network"
    );
    expect(withKey?.entries.map((entry) => entry.title)).toEqual([
      "DNS lookup",
      "Shodan lookup",
      "Whois lookup",
    ]);
  });
});

describe("relatedEntries", () => {
  it("lists the other entries of the category, never the entry itself", () => {
    const entries = buildLibraryEntries({
      caps: [dns, whois, shodan],
      playbooks: [],
      configured: new Set<string>(),
    });
    const first = entries.find((e) => e.id === dns.id);
    expect(first).toBeDefined();
    if (first === undefined) return;
    const keys = relatedEntries(entries, first).map((e) => e.id);
    expect(keys).not.toContain(dns.id);
    expect(keys).toEqual(
      entries
        .filter((e) => e.category === first.category && e.id !== dns.id)
        .map((e) => e.id)
    );
  });

  it("orders them as the Library does: ready first, then by title", () => {
    const entries = buildLibraryEntries({
      caps: [
        buildCapListItem({ id: "network.zeta.lookup", title: "Zeta" }),
        buildCapListItem({
          id: "network.alpha.lookup",
          title: "Alpha",
          credentials: [{ name: "ALPHA_KEY" }],
        }),
        buildCapListItem({ id: "network.beta.lookup", title: "Beta" }),
      ],
      playbooks: [],
      configured: new Set<string>(),
    });
    expect(
      relatedEntries(entries, { category: "network", key: "x" }).map(
        (e) => e.title
      )
    ).toEqual(["Beta", "Zeta", "Alpha"]);
  });

  it("caps the list at three", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      buildCapListItem({ id: `network.tool${i}.lookup`, title: `Tool ${i}` })
    );
    const entries = buildLibraryEntries({
      caps: many,
      playbooks: [],
      configured: new Set<string>(),
    });
    expect(
      relatedEntries(entries, { category: "network", key: "x" })
    ).toHaveLength(3);
  });

  it("is empty when nothing else shares the category", () => {
    expect(relatedEntries([], { category: "network", key: "cap:x" })).toEqual(
      []
    );
  });
});

describe("dataLabel", () => {
  it("says where the input goes", () => {
    expect(dataLabel({ isThirdParty: true })).toBe("Sent out");
    expect(dataLabel({ isThirdParty: false })).toBe("Stays here");
  });
});
