import type { EdgeRecord } from "@/domains/entities/edges/edges.functions";
import {
  confidenceStroke,
  type GraphEdge,
  type GraphNode,
} from "@/shared/ui/graph";
import type { EntityKind } from "@watchdog/schemas";

export type { GraphEdge, GraphNode } from "@/shared/ui/graph";

export interface EgoEntityRef {
  id: string;
  name: string;
  slug: string;
  kind: EntityKind;
}

const CX = 480;
const CY = 360;

/** Keep neighbors far enough apart that edge labels stay readable. */
function radiusForNeighborCount(count: number): number {
  if (count <= 1) {
    return 220;
  }
  if (count <= 3) {
    return 200;
  }
  if (count <= 6) {
    return 240;
  }
  if (count <= 12) {
    return 260 + count * 8;
  }
  return 280 + count * 10;
}

function radialPosition(
  index: number,
  totalOthers: number,
  isCenter: boolean
): { x: number; y: number } {
  if (isCenter) {
    return { x: CX, y: CY };
  }
  const radius = radiusForNeighborCount(totalOthers);
  const angle = (2 * Math.PI * index) / Math.max(totalOthers, 1) - Math.PI / 2;
  return {
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
  };
}

/** Build a 1-hop star from dossier edges (peer fields on EdgeRecord). */
export function edgesToEgoFlow({
  center,
  edges,
}: {
  center: EgoEntityRef;
  edges: EdgeRecord[];
}): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const peers: EdgeRecord[] = [];
  const peerSeen = new Set<string>();

  for (const edge of edges) {
    if (edge.peerId === center.id) continue;
    if (peerSeen.has(edge.peerId)) continue;
    peerSeen.add(edge.peerId);
    peers.push(edge);
  }

  const nodes: GraphNode[] = [
    {
      id: center.id,
      position: radialPosition(0, peers.length, true),
      data: {
        label: center.name,
        kind: center.kind,
        slug: center.slug,
        isCenter: true,
      },
    },
    ...peers.map((peer, index) => ({
      id: peer.peerId,
      position: radialPosition(index, peers.length, false),
      data: {
        label: peer.peerName || peer.peerSlug,
        kind: peer.peerKind,
        slug: peer.peerSlug,
        isCenter: false,
      },
    })),
  ];

  const flowEdges: GraphEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.fromId,
    target: edge.toId,
    data: {
      predicate: edge.predicate,
      confidence: edge.confidence,
      edgeId: edge.id,
    },
    style: { stroke: confidenceStroke(edge.confidence) },
  }));

  return { nodes, edges: flowEdges };
}
