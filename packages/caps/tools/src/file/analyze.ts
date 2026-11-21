import { createHash } from "node:crypto";

import { z } from "zod";

import { exifHints } from "./exif";
import { assertWithinInputLimit, FILE_MAX_INPUT_BYTES } from "./limits";
import { pdfInfoHints } from "./pdf-info";

export const fileAnalyzeSnapshotSchema = z.object({
  evidenceId: z.uuid(),
  queriedAt: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string(),
  magic: z.string().nullable(),
  mimeGuess: z.string().nullable(),
  exifHints: z.array(z.string()),
  pdfHints: z.array(z.string()),
  textPreview: z.string().nullable(),
});

export type FileAnalyzeSnapshot = z.infer<typeof fileAnalyzeSnapshotSchema>;

type MagicSignature = {
  magic: string;
  mime: string;
  matchesBytes: (bytes: Uint8Array) => boolean;
};

const MAGIC_SIGNATURES: MagicSignature[] = [
  {
    magic: "JPEG",
    mime: "image/jpeg",
    matchesBytes: (b) =>
      b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    magic: "PNG",
    mime: "image/png",
    matchesBytes: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47,
  },
  {
    magic: "PDF",
    mime: "application/pdf",
    matchesBytes: (b) =>
      b.length >= 4 &&
      b[0] === 0x25 &&
      b[1] === 0x50 &&
      b[2] === 0x44 &&
      b[3] === 0x46,
  },
  {
    magic: "ZIP",
    mime: "application/zip",
    matchesBytes: (b) =>
      b.length >= 4 &&
      b[0] === 0x50 &&
      b[1] === 0x4b &&
      (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07),
  },
];

function detectMagic(
  bytes: Uint8Array
): { magic: string; mime: string } | null {
  for (const sig of MAGIC_SIGNATURES) {
    if (sig.matchesBytes(bytes)) return { magic: sig.magic, mime: sig.mime };
  }
  return null;
}

function buildTextPreview(
  bytes: Uint8Array,
  magic: { magic: string; mime: string } | null
): string | null {
  if (magic && !magic.mime.startsWith("text/") && magic.magic !== "PDF") {
    return null;
  }
  const utf = new TextDecoder().decode(bytes.slice(0, 4000));
  if (!/^[\t\n\r\u0020-\u007E\u00A0-\uFFFF]*$/u.test(utf.slice(0, 200))) {
    return null;
  }
  return utf.slice(0, 2000);
}

/**
 * Detect type, hash, EXIF tags (JPEG/PNG) and PDF Document Information keys
 * with bounded parsers. Input over `FILE_MAX_INPUT_BYTES` is refused with a
 * `ValidationVendorError`.
 */
export function analyzeFileBytes(
  evidenceId: string,
  bytes: Uint8Array
): FileAnalyzeSnapshot {
  assertWithinInputLimit("File", bytes.length, FILE_MAX_INPUT_BYTES);
  const id = evidenceId.trim();
  const magic = detectMagic(bytes);
  const container =
    magic?.magic === "JPEG" || magic?.magic === "PNG" ? magic.magic : null;

  return fileAnalyzeSnapshotSchema.parse({
    evidenceId: id,
    queriedAt: new Date().toISOString(),
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    magic: magic?.magic ?? null,
    mimeGuess: magic?.mime ?? null,
    exifHints: exifHints(bytes, container),
    pdfHints: magic?.magic === "PDF" ? pdfInfoHints(bytes) : [],
    textPreview: buildTextPreview(bytes, magic),
  });
}
