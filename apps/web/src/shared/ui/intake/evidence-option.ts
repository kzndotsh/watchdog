import { formatOpaqueId } from "@/shared/ui/format-opaque-id";
import type { EvidenceKind } from "@watchdog/schemas";

/** Case Evidence option for pickers / composers (parent owns fetch). */
export interface EvidenceOption {
  id: string;
  kind: EvidenceKind;
  label?: string | null;
  sourceUrl?: string | null;
  sha256?: string | null;
}

export function evidenceLabel(row: EvidenceOption): string {
  const label = row.label?.trim();
  if (label !== undefined && label !== "") return label;
  const sourceUrl = row.sourceUrl?.trim();
  if (sourceUrl !== undefined && sourceUrl !== "") return sourceUrl;
  if (row.sha256 !== undefined && row.sha256 !== null && row.sha256 !== "")
    return `${row.kind} · ${formatOpaqueId(row.sha256, 8)}`;
  return `${row.kind} · ${formatOpaqueId(row.id, 8)}`;
}
