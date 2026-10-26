import { parseEdgePhraseValue } from "@watchdog/schemas/shared";
import type { EntityKind } from "@watchdog/schemas/shared";

export type ConnectionComposerValues = {
  peerId: string;
  /** The picked peer's kind: it narrows the relationships on offer. Null with no peer. */
  peerKind: EntityKind | null;
  phraseValue: string;
  notes: string;
};

export function connectionComposerIssues(
  values: ConnectionComposerValues,
  centerEntityId?: string
): string | null {
  const peerId = values.peerId.trim();
  if (peerId === "") return "Select a peer entity";
  const scopedCenterId = centerEntityId?.trim();
  if (scopedCenterId !== undefined && peerId === scopedCenterId) {
    return "Cannot connect an entity to itself";
  }
  const parsed = parseEdgePhraseValue(values.phraseValue);
  if (!parsed) return "Select a relationship";
  if (parsed.predicate === "related_to" && !values.notes.trim()) {
    return "related_to needs a short why (notes)";
  }
  return null;
}
