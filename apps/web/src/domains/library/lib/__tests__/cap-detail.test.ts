import { describe, expect, it } from "vitest";

import {
  buildCapDetailView,
  capPrivacyLine,
  formatCapDuration,
} from "@/domains/library/lib/cap-detail";
import {
  buildCapListItem,
  buildPlaybookListItem,
  testCapProvider,
} from "@/testing/records";

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
  it("names the provider when the input leaves the server", () => {
    expect(
      capPrivacyLine({
        egress: "third_party",
        provider: { ...testCapProvider, name: "Shodan" },
      })
    ).toBe("Your input is sent to Shodan.");
  });

  it("says the input stays when nothing leaves", () => {
    expect(capPrivacyLine({ egress: "none", provider: testCapProvider })).toBe(
      "Your input stays on this server."
    );
  });
});

describe("buildCapDetailView", () => {
  const cap = buildCapListItem({
    id: "network.shodan.lookup",
    egress: "third_party",
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
    expect(view.privacy).toBe("Your input is sent to Test provider.");
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
      { id: "host-footprint", title: "Host footprint" },
    ]);
  });

  it("reports no timeout or cache when the descriptor sets none", () => {
    const bare = buildCapDetailView(buildCapListItem(), [], new Set());
    expect(bare.timeout).toBeNull();
    expect(bare.cache).toBeNull();
    expect(bare.credentials).toEqual([]);
  });
});
