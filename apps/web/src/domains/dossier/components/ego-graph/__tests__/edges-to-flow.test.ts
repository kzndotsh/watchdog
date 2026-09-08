import { describe, expect, it } from "vitest";

import type { EdgeRecord } from "@/domains/entities/edges/types";
import { testId } from "@watchdog/test-kit";

import { edgesToEgoFlow } from "../edges-to-flow";

const CENTER_ID = testId(1);
const PEER_ID = testId(2);

function edge(overrides: Partial<EdgeRecord> = {}): EdgeRecord {
  return {
    id: testId(10),
    fromId: CENTER_ID,
    toId: PEER_ID,
    peerId: PEER_ID,
    peerName: "Peer",
    peerSlug: "peer",
    peerKind: "person",
    predicate: "related_to",
    confidence: "possible",
    notes: null,
    evidenceIds: [],
    direction: "out",
    ...overrides,
  };
}

describe("edgesToEgoFlow", () => {
  it("places the center entity and dedupes neighbor nodes", () => {
    const flow = edgesToEgoFlow({
      center: {
        id: CENTER_ID,
        name: "Center",
        slug: "center",
        kind: "person",
      },
      edges: [
        edge({ id: testId(11) }),
        edge({ id: testId(12), peerId: PEER_ID }),
      ],
    });

    expect(flow.nodes).toHaveLength(2);
    const center = flow.nodes[0];
    const peer = flow.nodes[1];
    expect(center?.data.isCenter).toBe(true);
    expect(center?.data.label).toBe("Center");
    expect(peer?.id).toBe(PEER_ID);
    expect(flow.edges).toHaveLength(2);
    expect(flow.edges.map((item) => item.data?.predicate)).toContain(
      "related_to"
    );
  });

  it("skips edges whose peer is the center entity", () => {
    const flow = edgesToEgoFlow({
      center: {
        id: CENTER_ID,
        name: "Center",
        slug: "center",
        kind: "person",
      },
      edges: [edge({ peerId: CENTER_ID })],
    });

    expect(flow.nodes).toHaveLength(1);
    expect(flow.edges).toHaveLength(1);
  });

  it("falls back to center slug when the center name is blank", () => {
    const flow = edgesToEgoFlow({
      center: {
        id: CENTER_ID,
        name: "  ",
        slug: "center-slug",
        kind: "person",
      },
      edges: [edge({ peerName: "Peer", peerSlug: "peer" })],
    });

    expect(flow.nodes[0]?.data.label).toBe("center-slug");
  });

  it("falls back to peer slug when the peer name is blank", () => {
    const flow = edgesToEgoFlow({
      center: {
        id: CENTER_ID,
        name: "Center",
        slug: "center",
        kind: "person",
      },
      edges: [edge({ peerName: "  ", peerSlug: "acme-corp" })],
    });

    expect(flow.nodes[1]?.data.label).toBe("acme-corp");
  });
});
