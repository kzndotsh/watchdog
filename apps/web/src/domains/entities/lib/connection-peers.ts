import { entityDisplayLabel } from "@watchdog/schemas/shared";

function peerDisplayLabel(peer: {
  peerName: string;
  peerSlug: string;
}): string {
  return entityDisplayLabel({ name: peer.peerName, slug: peer.peerSlug });
}

/** Stable Connection list order (peer label, case-insensitive). */
export function sortEdgesByPeerLabel<
  T extends { peerName: string; peerSlug: string },
>(edges: readonly T[]): T[] {
  return [...edges].sort((a, b) =>
    peerDisplayLabel(a).localeCompare(peerDisplayLabel(b))
  );
}
