import { evidenceDisplayLabel } from "@watchdog/schemas/evidence";
import type { EvidenceKind } from "@watchdog/schemas/shared";

export function safeFilename(label: string): string {
  return (
    label
      // oxlint-disable-next-line eslint/no-control-regex -- intentionally strips filesystem-illegal control chars
      .replaceAll(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .replaceAll(/\s+/g, "-")
      .slice(0, 80)
  );
}

const MIME_EXTENSIONS: Record<string, string> = {
  "application/json": ".json",
  "text/plain": ".txt",
  "text/html": ".html",
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

export function evidenceExt(mime: string | null, label: string | null): string {
  if (label) {
    const e = /\.[a-z0-9]+$/i.exec(label)?.[0];
    if (e) return e;
  }
  return MIME_EXTENSIONS[mime?.split(";")[0]?.trim() ?? ""] ?? ".bin";
}

/** The Evidence fields a zip path is made from. */
export type EvidencePathFields = {
  id: string;
  label: string | null;
  sourceUrl: string | null;
  mime: string | null;
  kind: EvidenceKind;
};

/**
 * `<case>/evidence/<id prefix>--<label><ext>`: `ext` is the file's own extension (a blob) or
 * `.txt` (a text body).
 */
export function evidenceZipPath(
  caseSlug: string,
  ev: EvidencePathFields,
  extension: "blob" | "text"
): string {
  const labelBase = safeFilename(
    evidenceDisplayLabel({
      label: ev.label,
      kind: ev.kind,
      sourceUrl: ev.sourceUrl,
    })
  );
  const ext = extension === "blob" ? evidenceExt(ev.mime, ev.label) : ".txt";
  return `${caseSlug}/evidence/${ev.id.slice(0, 8)}--${labelBase}${ext}`;
}
