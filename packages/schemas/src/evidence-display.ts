import { EVIDENCE_KIND_LABELS } from "./display-labels";
import type { EvidenceKind } from "./vocab";

export interface EvidenceTitleRow {
  id: string;
  label?: string | null;
  kind: EvidenceKind;
  sourceUrl?: string | null;
}

/** Short evidence label: user label → URL host → kind display label. */
export function evidenceDisplayLabel(opts: {
  label?: string | null;
  kind: EvidenceKind;
  sourceUrl?: string | null;
}): string {
  const trimmed = opts.label?.trim();
  if (trimmed !== undefined && trimmed !== "") {
    return trimmed;
  }
  const sourceUrl = opts.sourceUrl?.trim();
  if (sourceUrl !== undefined && sourceUrl !== "") {
    try {
      return new URL(sourceUrl).hostname;
    } catch {
      return sourceUrl;
    }
  }
  return EVIDENCE_KIND_LABELS[opts.kind];
}

/** Id → display title for job-input search and collect filters. */
export function evidenceTitleMapFromRows(
  rows: readonly EvidenceTitleRow[],
  neededIds?: ReadonlySet<string>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (neededIds !== undefined && !neededIds.has(row.id)) continue;
    map.set(row.id, evidenceDisplayLabel(row));
  }
  return map;
}
