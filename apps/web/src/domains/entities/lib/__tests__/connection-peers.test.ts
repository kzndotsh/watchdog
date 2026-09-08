import { describe, it, expect } from "vitest";

import { entityDisplayLabel } from "@watchdog/schemas";

import type { CaseEdgeRecord } from "../../edges/types.ts";
import {
  connectionPeersByEntityId,
  sortEdgesByPeerLabel,
} from "../connection-peers.ts";

function edge(
  partial: Pick<
    CaseEdgeRecord,
    | "id"
    | "fromId"
    | "fromName"
    | "fromKind"
    | "toId"
    | "toName"
    | "toKind"
    | "predicate"
  > & {
    fromSlug?: string;
    toSlug?: string;
  }
): CaseEdgeRecord {
  return {
    ...partial,
    fromSlug: partial.fromSlug ?? partial.fromName.toLowerCase(),
    toSlug: partial.toSlug ?? partial.toName.toLowerCase(),
    confidence: "unverified",
    notes: null,
    evidenceIds: [],
  };
}

describe("connection-peers", () => {
  it("entityDisplayLabel trims name and falls back to slug", () => {
    expect(entityDisplayLabel({ name: "  Alpha  ", slug: "alpha-corp" })).toBe(
      "Alpha"
    );
    expect(entityDisplayLabel({ name: "  ", slug: "alpha-corp" })).toBe(
      "alpha-corp"
    );
  });

  it("connectionPeersByEntityId indexes both endpoints", () => {
    const edges = [
      edge({
        id: "e1",
        fromId: "org1",
        fromName: "Acme",
        fromKind: "org",
        toId: "infra1",
        toName: "acme.com",
        toKind: "infra",
        predicate: "primary_domain",
      }),
    ];
    const map = connectionPeersByEntityId(edges);
    expect(map.get("org1")?.length).toBe(1);
    expect(map.get("org1")?.[0]?.peerName).toBe("acme.com");
    expect(map.get("org1")?.[0]?.peerSlug).toBe("acme.com");
    expect(map.get("org1")?.[0]?.direction).toBe("out");
    expect(map.get("infra1")?.[0]?.peerName).toBe("Acme");
    expect(map.get("infra1")?.[0]?.peerSlug).toBe("acme");
    expect(map.get("infra1")?.[0]?.direction).toBe("in");
  });

  it("connectionPeersByEntityId enriches peers with entity summary and notes", () => {
    const edges = [
      edge({
        id: "e1",
        fromId: "org1",
        fromName: "Center",
        fromKind: "org",
        toId: "peer1",
        toName: "Acme",
        toKind: "org",
        predicate: "related_to",
      }),
    ];
    const entityTextById = new Map([
      ["peer1", { summary: "Shell company", notes: "Delaware filing" }],
    ]);
    const peer = connectionPeersByEntityId(edges, entityTextById).get(
      "org1"
    )?.[0];
    expect(peer?.peerSummary).toBe("Shell company");
    expect(peer?.peerNotes).toBe("Delaware filing");
  });

  it("connectionPeersByEntityId sorts unnamed peers by slug", () => {
    const edges = [
      edge({
        id: "e1",
        fromId: "org1",
        fromName: "Center",
        fromKind: "org",
        toId: "peer-z",
        toName: "",
        toSlug: "zeta-host",
        toKind: "infra",
        predicate: "related_to",
      }),
      edge({
        id: "e2",
        fromId: "org1",
        fromName: "Center",
        fromKind: "org",
        toId: "peer-a",
        toName: "",
        toSlug: "alpha-host",
        toKind: "infra",
        predicate: "related_to",
      }),
    ];

    const peers = connectionPeersByEntityId(edges).get("org1") ?? [];
    expect(peers.map((peer) => peer.peerSlug)).toEqual([
      "alpha-host",
      "zeta-host",
    ]);
  });

  it("sortEdgesByPeerLabel orders by display label and falls back to slug", () => {
    const sorted = sortEdgesByPeerLabel([
      {
        id: "e3",
        peerName: "Zeta Corp",
        peerSlug: "zeta",
        direction: "out",
      },
      {
        id: "e1",
        peerName: "",
        peerSlug: "alpha",
        direction: "out",
      },
      {
        id: "e2",
        peerName: "Beta LLC",
        peerSlug: "beta",
        direction: "out",
      },
    ]);

    expect(sorted.map((edge) => edge.id)).toEqual(["e1", "e2", "e3"]);
  });
});
