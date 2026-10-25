import { describe, expect, it } from "vitest";

import {
  buildCapDetailView,
  buildCapRequirements,
  capPrivacyLine,
  catalogTakenKinds,
  formatCapDuration,
  kindChipsFor,
  playbookOutputKinds,
} from "@/domains/library/lib/cap-detail";
import { buildCapListItem, buildPlaybookListItem } from "@/testing/records";

describe("formatCapDuration", () => {
  it("picks the largest unit that divides evenly", () => {
    expect(formatCapDuration(500)).toBe("500 ms");
    expect(formatCapDuration(30_000)).toBe("30 s");
    expect(formatCapDuration(90_000)).toBe("90 s");
    expect(formatCapDuration(300_000)).toBe("5 min");
    expect(formatCapDuration(3_600_000)).toBe("1 h");
    expect(formatCapDuration(172_800_000)).toBe("2 d");
  });
});

describe("capPrivacyLine", () => {
  it("names where the input goes when it leaves the server", () => {
    expect(
      capPrivacyLine({
        contacts: [
          { kind: "provider", host: "api.vendor.test", access: "keyed" },
          { kind: "target", via: "http" },
        ],
      })
    ).toBe("Your input is sent to api.vendor.test, the host you enter.");
  });

  it("says a fixed download carries no input", () => {
    expect(
      capPrivacyLine({
        contacts: [
          { kind: "download", url: "https://lists.vendor.test/feed.txt" },
        ],
      })
    ).toBe("Downloads a public list. Your input is not sent.");
  });

  it("says the input stays when nothing leaves", () => {
    expect(capPrivacyLine({ contacts: [] })).toBe(
      "Your input stays on this server."
    );
  });
});

describe("buildCapDetailView", () => {
  const cap = buildCapListItem({
    id: "network.shodan.lookup",
    egress: ["account_lookup"],
    contacts: [{ kind: "provider", host: "api.vendor.test", access: "keyed" }],
    consumes: [{ kind: "identifier", type: "ip" }, { kind: "host" }],
    produces: [{ kind: "identifier", type: "email" }, { kind: "entity" }],
    timeoutMs: 45_000,
    jobPolicy: { cacheTtlMs: 3_600_000 },
    flags: ["third_party", "slow", "needs_key"],
    credentials: [
      { name: "SHODAN_API_KEY" },
      { name: "EXTRA", optional: true },
      { anyOf: ["A_KEY", "B_KEY"] },
    ],
  });
  const view = buildCapDetailView(
    cap,
    [
      buildPlaybookListItem({
        id: "host-footprint",
        title: "Host footprint",
        steps: ["network.dns.lookup", "network.shodan.lookup"],
      }),
      buildPlaybookListItem({ id: "other", steps: ["network.dns.lookup"] }),
    ],
    new Set(["ip", "domain", "email"])
  );

  it("maps consumes and produces to input kinds, linked only when something takes them", () => {
    expect(view.consumes).toEqual([
      { kind: "ip", label: "IP address", isLinked: true },
      { kind: "domain", label: "Domain", isLinked: true },
    ]);
    expect(view.produces).toEqual([
      { kind: "email", label: "Email address", isLinked: true },
      { kind: "entity", label: "Entity", isLinked: false },
    ]);
  });

  it("reads behaviour, keeping only the risk flags", () => {
    expect(view.timeout).toBe("45 s");
    expect(view.cache).toBe("1 h");
    expect(view.flags).toEqual(["slow"]);
    expect(view.privacy).toBe("Your input is sent to api.vendor.test.");
  });

  it("lists credentials, optional and any-of included", () => {
    expect(view.credentials).toEqual([
      { slots: ["SHODAN_API_KEY"], isOptional: false },
      { slots: ["EXTRA"], isOptional: true },
      { slots: ["A_KEY", "B_KEY"], isOptional: false },
    ]);
  });

  it("links the Playbooks that include the Cap", () => {
    expect(view.playbooks).toEqual([
      { id: "host-footprint", title: "Host footprint", stepCount: 2 },
    ]);
  });

  it("reports no timeout or cache when the descriptor sets none", () => {
    const bare = buildCapDetailView(buildCapListItem(), [], new Set());
    expect(bare.timeout).toBeNull();
    expect(bare.cache).toBeNull();
    expect(bare.credentials).toEqual([]);
  });
});

describe("buildCapRequirements", () => {
  const credentials = [
    { slots: ["SHODAN_API_KEY"], isOptional: false },
    { slots: ["EXTRA"], isOptional: true },
    { slots: ["A_KEY", "B_KEY"], isOptional: false },
  ];

  it("reads every line from the vault, optional and later missing keys included", () => {
    expect(
      buildCapRequirements(credentials, new Set(["A_KEY"])).map(
        (line) => line.status
      )
    ).toEqual(["missing", "optional, missing", "configured"]);
  });

  it("marks a line configured when its one key is saved", () => {
    expect(
      buildCapRequirements(
        credentials,
        new Set(["SHODAN_API_KEY", "EXTRA"])
      ).map((line) => line.state)
    ).toEqual(["configured", "configured", "missing"]);
  });

  it("is unknown everywhere when the vault could not be read", () => {
    expect(
      buildCapRequirements(credentials, null).map((line) => line.state)
    ).toEqual(["unknown", "unknown", "unknown"]);
  });

  it("is empty when the Cap reads no keys", () => {
    expect(buildCapRequirements([], new Set())).toEqual([]);
  });
});

describe("kindChipsFor", () => {
  it("labels each kind once and links only the kinds the Library can filter by", () => {
    expect(kindChipsFor(["ip", "domain", "ip"], new Set(["ip"]))).toEqual([
      { kind: "ip", label: "IP address", isLinked: true },
      { kind: "domain", label: "Domain", isLinked: false },
    ]);
  });
});

describe("catalogTakenKinds", () => {
  it("collects what every Cap consumes and every Playbook starts from", () => {
    const taken = catalogTakenKinds(
      [buildCapListItem({ consumes: [{ kind: "ip" }] })],
      [buildPlaybookListItem({ seedKinds: ["email"] })]
    );
    expect([...taken].sort()).toEqual(["email", "ip"]);
  });
});

describe("playbookOutputKinds", () => {
  it("lists what the steps' Caps produce, in step order", () => {
    const caps = [
      buildCapListItem({ id: "a.x.lookup", produces: [{ kind: "ip" }] }),
      buildCapListItem({ id: "b.y.lookup", produces: [{ kind: "url" }] }),
    ];
    expect(playbookOutputKinds(["b.y.lookup", "a.x.lookup"], caps)).toEqual([
      "url",
      "ip",
    ]);
  });

  it("skips a step whose Cap is not in the catalog", () => {
    expect(playbookOutputKinds(["gone.cap.lookup"], [])).toEqual([]);
  });
});
