import { describe, it, expect } from "vitest";

import {
  clampEdgePhrase,
  edgePhraseOptions,
  edgePhraseOptionsForPeers,
  filterPeerOptionsForPhrase,
  peerKindAllowedForPhrase,
  preferredEdgePhrase,
  edgePhraseValue,
} from "../../../../shared/ui/vocab/edge-predicate.ts";

function requirePhrase(hit: ReturnType<typeof preferredEdgePhrase>) {
  expect(hit).toBeDefined();
  if (hit === null) throw new TypeError("expected a preferred phrase");
  return hit;
}

describe("preferred-edge-phrase", () => {
  it("preferredEdgePhrase: org → infra defaults to primary_domain forward", () => {
    const hit = requirePhrase(preferredEdgePhrase("org", "infra"));
    expect(hit.predicate).toBe("primary_domain");
    expect(hit.orientation).toBe("forward");
    expect(hit.group).toBe("Domains & Hosting");
  });

  it("preferredEdgePhrase: infra → org defaults to primary_domain inverse", () => {
    const hit = requirePhrase(preferredEdgePhrase("infra", "org"));
    expect(hit.predicate).toBe("primary_domain");
    expect(hit.orientation).toBe("inverse");
    expect(hit.group).toBe("Domains & Hosting");
  });

  it("preferredEdgePhrase: org → org defaults to parent_of forward", () => {
    const hit = requirePhrase(preferredEdgePhrase("org", "org"));
    expect(hit.predicate).toBe("parent_of");
    expect(hit.orientation).toBe("forward");
    expect(hit.group).toBe("Ownership & Control");
  });

  it("preferredEdgePhrase: infra → infra defaults to parent_of forward", () => {
    const hit = requirePhrase(preferredEdgePhrase("infra", "infra"));
    expect(hit.predicate).toBe("parent_of");
    expect(hit.orientation).toBe("forward");
  });

  it("preferredEdgePhrase: other pairs return a valid option", () => {
    const hit = requirePhrase(preferredEdgePhrase("person", "org"));
    expect(hit.value.includes(":")).toBeTruthy();
  });

  it("edgePhraseOptions: both orientations share semantic group", () => {
    const opts = edgePhraseOptions({ fromKind: "org", toKind: "org" });
    const byValue = new Map(opts.map((o) => [o.value, o]));

    expect(byValue.get("parent_of:forward")?.group).toBe("Ownership & Control");
    expect(byValue.get("parent_of:inverse")?.group).toBe("Ownership & Control");
    expect(byValue.get("owns:forward")?.group).toBe("Ownership & Control");
    expect(byValue.get("owns:inverse")?.group).toBe("Ownership & Control");
    expect(byValue.get("leads:forward")?.group).toBe("Roles & Affiliation");
    expect(byValue.get("founded:forward")?.group).toBe("Roles & Affiliation");
    expect(byValue.get("member_of:forward")?.group).toBe("Roles & Affiliation");
    expect(byValue.get("same_as:forward")?.group).toBe("Identity");
    expect(byValue.get("suspected_as:forward")?.group).toBe("Identity");
    expect(byValue.get("suspected_as:inverse")?.group).toBe("Identity");
    expect(byValue.get("related_to:forward")?.group).toBe("Other");
  });

  it("clampEdgePhrase: keeps valid phrase", () => {
    const hit = clampEdgePhrase("org", "infra", "primary_domain", "forward");
    expect(hit.predicate).toBe("primary_domain");
    expect(hit.orientation).toBe("forward");
  });

  it("clampEdgePhrase: invalid falls to preferred", () => {
    const hit = clampEdgePhrase("org", "infra", "leads", "forward");
    expect(hit.predicate).toBe("primary_domain");
    expect(hit.orientation).toBe("forward");
  });

  it("peerKindAllowedForPhrase: person operates forward allows org and infra only", () => {
    expect(
      peerKindAllowedForPhrase("person", "org", "operates", "forward")
    ).toBe(true);
    expect(
      peerKindAllowedForPhrase("person", "infra", "operates", "forward")
    ).toBe(true);
    expect(
      peerKindAllowedForPhrase("person", "person", "operates", "forward")
    ).toBe(false);
  });

  it("edgePhraseOptionsForPeers: person with only person peers omits operates", () => {
    const phrases = edgePhraseOptionsForPeers("person", [
      { id: "p1", name: "A", slug: "a", kind: "person" },
    ]);
    expect(phrases.some((phrase) => phrase.predicate === "operates")).toBe(
      false
    );
    expect(phrases.some((phrase) => phrase.predicate === "associate_of")).toBe(
      true
    );
  });

  it("edgePhraseOptions: person to infra omits hosted_on", () => {
    const opts = edgePhraseOptions({ fromKind: "person", toKind: "infra" });
    expect(opts.some((phrase) => phrase.predicate === "hosted_on")).toBe(false);
  });

  it("edgePhraseOptions: infra to infra includes hosted_on", () => {
    const opts = edgePhraseOptions({ fromKind: "infra", toKind: "infra" });
    expect(opts.some((phrase) => phrase.predicate === "hosted_on")).toBe(true);
  });

  it("edgePhraseOptions: person to org includes employee_of", () => {
    const opts = edgePhraseOptions({ fromKind: "person", toKind: "org" });
    expect(opts.some((phrase) => phrase.predicate === "employee_of")).toBe(
      true
    );
  });

  it("edgePhraseOptionsForPeers: person with org peer includes operates", () => {
    const phrases = edgePhraseOptionsForPeers("person", [
      { id: "p1", name: "A", slug: "a", kind: "person" },
      { id: "o1", name: "Org", slug: "org", kind: "org" },
    ]);
    expect(phrases.some((phrase) => phrase.predicate === "operates")).toBe(
      true
    );
  });

  it("filterPeerOptionsForPhrase: operates on person drops person peers", () => {
    const peers = [
      { id: "p1", name: "Person", slug: "p1", kind: "person" as const },
      { id: "o1", name: "Org", slug: "o1", kind: "org" as const },
      { id: "i1", name: "Infra", slug: "i1", kind: "infra" as const },
    ];
    const filtered = filterPeerOptionsForPhrase(
      "person",
      peers,
      edgePhraseValue("operates", "forward")
    );
    expect(filtered.map((peer) => peer.id)).toEqual(["o1", "i1"]);
  });
});
