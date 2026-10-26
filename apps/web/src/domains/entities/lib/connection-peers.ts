import type {
  CaseEdgeRecord,
  EdgeRecord,
} from "@/domains/entities/edges/types";

/**
 * A row of the Connection list seen from one of its ends: the other end is the peer, and the
 * direction says which end the Entity is (`out` when it is the source). The Dossier's dialogs,
 * rows and ego graph work on this view; the list itself carries both ends.
 */
export function edgeFromEntity(
  row: CaseEdgeRecord,
  entityId: string
): EdgeRecord {
  const isOutbound = row.fromId === entityId;
  return {
    id: row.id,
    fromId: row.fromId,
    toId: row.toId,
    predicate: row.predicate,
    confidence: row.confidence,
    notes: row.notes,
    evidenceIds: row.evidenceIds,
    peerId: isOutbound ? row.toId : row.fromId,
    peerName: isOutbound ? row.toName : row.fromName,
    peerSlug: isOutbound ? row.toSlug : row.fromSlug,
    peerKind: isOutbound ? row.toKind : row.fromKind,
    direction: isOutbound ? "out" : "in",
    version: row.version,
  };
}
