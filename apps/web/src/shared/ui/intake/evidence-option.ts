import { formatOpaqueId } from "@/shared/ui/format-opaque-id";
import { kindLabel } from "@/shared/ui/vocab/kind.lib";
import { evidenceDisplayLabel, type EvidenceKind } from "@watchdog/schemas";

/** Case Evidence option for pickers / composers (parent owns fetch). */
export interface EvidenceOption {
  id: string;
  kind: EvidenceKind;
  label?: string | null;
  sourceUrl?: string | null;
  sha256?: string | null;
}

/** Shared label head: user label → URL host → kind. */
export function evidencePrimaryLabel(row: {
  label?: string | null;
  sourceUrl?: string | null;
  kind: EvidenceKind;
}): string {
  return evidenceDisplayLabel(row);
}

/** Full source URL when it adds detail beyond `evidencePrimaryLabel`. */
export function evidenceSourceFootnote(
  row: {
    label?: string | null;
    sourceUrl?: string | null;
    kind: EvidenceKind;
  },
  primaryLabel: string
): string | null {
  const sourceUrl = row.sourceUrl?.trim();
  if (sourceUrl === undefined || sourceUrl === "") return null;
  if (primaryLabel === sourceUrl) return null;
  try {
    if (primaryLabel === new URL(sourceUrl).hostname) return null;
  } catch {
    /* keep footnote when URL is not parseable */
  }
  return sourceUrl;
}

export function evidenceLabel(row: EvidenceOption): string {
  const primary = evidencePrimaryLabel(row);
  const hasUserFacingHead =
    Boolean(row.label?.trim()) || Boolean(row.sourceUrl?.trim());
  if (hasUserFacingHead) return primary;
  if (row.sha256 !== undefined && row.sha256 !== null && row.sha256 !== "")
    return `${primary} · ${formatOpaqueId(row.sha256, 8)}`;
  return `${primary} · ${formatOpaqueId(row.id, 8)}`;
}

export interface EvidenceFilterFields {
  kind: EvidenceKind;
  label?: string | null;
  sourceUrl?: string | null;
  sha256?: string | null;
  notes?: string | null;
  text?: string | null;
  mime?: string | null;
}

function evidenceFilterHead(
  row: EvidenceFilterFields & { id?: string }
): string {
  if (row.id === undefined) return evidencePrimaryLabel(row);
  return evidenceLabel({
    id: row.id,
    kind: row.kind,
    label: row.label,
    sourceUrl: row.sourceUrl,
    sha256: row.sha256,
  });
}

/** Lowercase haystack for picker/checklist/queue text filters. */
export function evidenceFilterHaystack(
  row: EvidenceFilterFields & { id?: string }
): string {
  const head = evidenceFilterHead(row);
  return [
    head,
    row.label ?? "",
    row.notes ?? "",
    row.sourceUrl ?? "",
    row.text ?? "",
    row.sha256 ?? "",
    row.mime ?? "",
    kindLabel(row.kind),
    row.kind,
  ]
    .join(" ")
    .toLowerCase();
}

/** Lowercase haystack for picker/checklist text filter. */
export function evidencePickerFilterHaystack(row: EvidenceOption): string {
  return evidenceFilterHaystack(row);
}

export function evidenceMatchesPickerFilter(
  row: EvidenceOption,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return evidenceFilterHaystack(row).includes(q);
}
