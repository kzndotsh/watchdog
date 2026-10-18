import type {
  GraphHistoryChannel,
  GraphHistoryOp,
} from "@watchdog/schemas/shared";

export const HISTORY_OP_LABELS: Record<GraphHistoryOp, string> = {
  create: "Created",
  update: "Updated",
  retract: "Retracted",
  delete: "Deleted",
};

/** How the change arrived; a Dossier edit is the default and needs no note. */
export const HISTORY_CHANNEL_LABELS: Record<
  GraphHistoryChannel,
  string | null
> = {
  dossier: null,
  triage_accept: "via Triage",
  agent_write: "via agent",
  system: "by the system",
};

/** `evidenceIds` -> `evidence ids`: a snapshot field name as words. */
export function historyFieldLabel(field: string): string {
  return field
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replaceAll(/\bid(s?)\b/g, "id$1");
}

/**
 * The changed fields of an update as one line (`text, confidence`); a create
 * or delete lists nothing, since the verb says it all.
 */
export function historyChangedFieldsLine(
  op: GraphHistoryOp,
  fields: readonly string[]
): string | null {
  if (op === "create" || op === "delete" || fields.length === 0) return null;
  return fields.map((field) => historyFieldLabel(field)).join(", ");
}
