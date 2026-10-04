import type { ProcessExtractDraft } from "@watchdog/ai";
import type { FileAnalyzeSnapshot } from "@watchdog/tools/file";

import { describeFilenameForensics } from "../lib/filename-forensics";

/** Map file analyze snapshot → ProcessExtractDraft for shared interpret. */
export function fileAnalyzeToDraft(
  snap: FileAnalyzeSnapshot,
  label?: string
): ProcessExtractDraft {
  const claims: ProcessExtractDraft["claims"] = [
    {
      text: `File analyze: magic=${snap.magic ?? "unknown"} mime=${snap.mimeGuess ?? "?"} sha256=${snap.sha256.slice(0, 16)}… bytes=${snap.byteLength}`,
    },
  ];
  if (snap.exifHints.length) {
    claims.push({
      text: `EXIF/XMP string tags present: ${snap.exifHints.join(", ")}`,
    });
  }
  if (snap.pdfHints.length) {
    claims.push({
      text: `PDF info hints: ${snap.pdfHints.slice(0, 5).join(" | ")}`,
    });
  }
  if (label) {
    const hit = describeFilenameForensics(label);
    if (hit) {
      claims.push({
        text: `Filename forensics (${hit.label}): ${hit.detail}`,
      });
    }
  }
  return {
    summary: `Analyzed file Evidence (${snap.magic ?? "unknown"})`,
    identifiers: [],
    claims,
    questions: [],
  };
}
