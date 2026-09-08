import type { CaseEdgeRecord } from "@/domains/entities/edges/types";
import type {
  EdgeDirection,
  EdgePredicate,
  EntityKind,
} from "@watchdog/schemas";
import { entityDisplayLabel } from "@watchdog/schemas";

export { entityDisplayLabel };

export interface EntityConnectionPeer {
  edgeId: string;
  peerId: string;
  peerName: string;
  peerSlug: string;
  peerKind: EntityKind;
  peerSummary: string | null;
  peerNotes: string | null;
  predicate: EdgePredicate;
  direction: EdgeDirection;
  notes: string | null;
  fromId: string;
  toId: string;
}

export interface EntityPeerText {
  summary: string | null;
  notes: string | null;
}

function peerDisplayLabel(peer: {
  peerName: string;
  peerSlug: string;
}): string {
  return entityDisplayLabel({ name: peer.peerName, slug: peer.peerSlug });
}

/** Map entityId → connected peers (both directions), sorted by peer name. */
export function connectionPeersByEntityId(
  edges: readonly CaseEdgeRecord[],
  entityTextById?: ReadonlyMap<string, EntityPeerText>
): Map<string, EntityConnectionPeer[]> {
  const map = new Map<string, EntityConnectionPeer[]>();

  function push(entityId: string, peer: EntityConnectionPeer) {
    const list = map.get(entityId);
    if (list) {
      list.push(peer);
      return;
    }
    map.set(entityId, [peer]);
  }

  for (const edge of edges) {
    const shared = {
      edgeId: edge.id,
      predicate: edge.predicate,
      notes: edge.notes,
      fromId: edge.fromId,
      toId: edge.toId,
    };
    const toText = entityTextById?.get(edge.toId);
    push(edge.fromId, {
      ...shared,
      peerId: edge.toId,
      peerName: edge.toName,
      peerSlug: edge.toSlug,
      peerKind: edge.toKind,
      peerSummary: toText?.summary ?? null,
      peerNotes: toText?.notes ?? null,
      direction: "out",
    });
    const fromText = entityTextById?.get(edge.fromId);
    push(edge.toId, {
      ...shared,
      peerId: edge.fromId,
      peerName: edge.fromName,
      peerSlug: edge.fromSlug,
      peerKind: edge.fromKind,
      peerSummary: fromText?.summary ?? null,
      peerNotes: fromText?.notes ?? null,
      direction: "in",
    });
  }

  for (const list of map.values()) {
    list.sort((a, b) => peerDisplayLabel(a).localeCompare(peerDisplayLabel(b)));
  }
  return map;
}

/** Stable dossier connection list order (peer label, case-insensitive). */
export function sortEdgesByPeerLabel<
  T extends { peerName: string; peerSlug: string },
>(edges: readonly T[]): T[] {
  return [...edges].sort((a, b) =>
    peerDisplayLabel(a).localeCompare(peerDisplayLabel(b))
  );
}
