import { EVIDENCE_KIND_LABELS } from "./display-labels";
import type { EvidenceKind } from "./vocab";

export type EvidenceTitleRow = {
  id: string;
  label?: string | null;
  kind: EvidenceKind;
  sourceUrl?: string | null;
};

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

/**
 * Image types the browser may show inline as an Evidence preview. SVG is left out: it can
 * carry script. Anything else is only ever downloaded as a file.
 */
export const INLINE_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
] as const;
export type InlineImageMime = (typeof INLINE_IMAGE_MIMES)[number];

/** The inline-previewable type an Evidence `mime` names, or null. Parameters and case are ignored. */
export function inlineImageMime(
  mime: string | null | undefined
): InlineImageMime | null {
  const bare = mime?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return INLINE_IMAGE_MIMES.find((allowed) => allowed === bare) ?? null;
}
